param([ValidateSet('Create','Verify','EditWord')][string]$Mode='Create',[Parameter(Mandatory=$true)][string]$Folder,[string]$File,[string]$Text='')
$ErrorActionPreference='Stop'
$resolvedFolder=[IO.Path]::GetFullPath($Folder)
$temporaryRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
if (-not $resolvedFolder.StartsWith($temporaryRoot,[StringComparison]::OrdinalIgnoreCase) -or -not ($resolvedFolder -match 'dockitty-office-')) { throw 'Office verification only accepts its isolated temporary folder' }
[IO.Directory]::CreateDirectory($resolvedFolder) | Out-Null
$word=$null; $excel=$null; $powerpoint=$null
$hadPowerPoint=@(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
$report=[System.Collections.Generic.List[object]]::new()
try {
  if ($Mode -eq 'EditWord') {
    $resolvedFile=[IO.Path]::GetFullPath($File)
    if (-not $resolvedFile.StartsWith($resolvedFolder+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Draft must be inside the isolated folder' }
    Write-Output 'Starting isolated Word instance'; $word=New-Object -ComObject Word.Application; $word.Visible=$false; $word.DisplayAlerts=0
    $document=$word.Documents.Open($resolvedFile,$false,$false)
    try { $range=$document.Range($document.Content.End-1,$document.Content.End-1); $range.InsertAfter($Text); $document.Save() } finally { $document.Close(0) }
    Write-Output 'Saved using Microsoft Word'
    return
  }
  Write-Output 'Starting isolated Word instance'; $word=New-Object -ComObject Word.Application; $word.Visible=$false; $word.DisplayAlerts=0
  Write-Output 'Starting isolated Excel instance'; $excel=New-Object -ComObject Excel.Application; $excel.Visible=$false; $excel.DisplayAlerts=$false
  Write-Output 'Starting PowerPoint automation'; $powerpoint=New-Object -ComObject PowerPoint.Application
  if ($Mode -eq 'Create') {
    Write-Output 'Creating Word document'; $document=$word.Documents.Add()
    try {
      $document.Content.Text="Spectral document regression`rResearch background and experimental methods.`r"
      $document.Paragraphs.Item(1).Range.Font.Size=20
      $table=$document.Tables.Add($document.Range($document.Content.End-1,$document.Content.End-1),2,2)
      $table.Cell(1,1).Range.Text='Sample'; $table.Cell(1,2).Range.Text='Signal'; $table.Cell(2,1).Range.Text='A'; $table.Cell(2,2).Range.Text='0.91'
      $picture=Join-Path (Split-Path $PSScriptRoot -Parent) 'apps/desktop/resources/icon.png'
      Write-Output 'Adding Word image'; $document.InlineShapes.AddPicture($picture,$false,$true,$document.Range($document.Content.End-1,$document.Content.End-1)) | Out-Null
      for($i=1;$i -le 10;$i++) {
        $range=$document.Range($document.Content.End-1,$document.Content.End-1); $range.InsertAfter("`rRevision $i : verified experimental observation.")
        $target=Join-Path $resolvedFolder ('word-'+$i.ToString('00')+'.docx'); $document.SaveAs2($target,16)
        Write-Output ('Created Word revision '+$i)
      }
      $document.SaveAs2((Join-Path $resolvedFolder 'legacy.doc'),0)
    } finally { $document.Close(0) }
    $book=$excel.Workbooks.Add()
    try {
      $sheet=$book.Worksheets.Item(1); $sheet.Name='Results'
      $sheet.Range('B2').Value2='Measured'; $sheet.Range('D7').Value2=10; $sheet.Range('E7').Formula='=D7*2'
      $sheet.Range('B12:C12').Merge(); $sheet.Range('B12').Value2='Merged label'
      $second=$book.Worksheets.Add(); $second.Name='Notes'; $second.Range('C5').Value2='Sparse coordinate record'
      for($i=1;$i -le 3;$i++) { $sheet.Range('D7').Value2=$i*10; $book.SaveAs((Join-Path $resolvedFolder ('excel-'+$i.ToString('00')+'.xlsx')),51); Write-Output ('Created Excel revision '+$i) }
      $book.SaveAs((Join-Path $resolvedFolder 'legacy.xls'),56)
    } finally { $book.Close($false) }
    $presentation=$powerpoint.Presentations.Add(0)
    try {
      for($i=1;$i -le 3;$i++) {
        $slide=$presentation.Slides.Add($i,12)
        $box=$slide.Shapes.AddTextbox(1,40,40,600,120); $box.TextFrame.TextRange.Text='Experimental evidence '+$i
        $picture=Join-Path (Split-Path $PSScriptRoot -Parent) 'apps/desktop/resources/icon.png'
        $slide.Shapes.AddPicture($picture,0,-1,350,180,96,96) | Out-Null
        $shape=$slide.Shapes.AddShape(1,80,190,200,100); $shape.Fill.ForeColor.RGB=10444064
        $presentation.SaveAs((Join-Path $resolvedFolder ('powerpoint-'+$i.ToString('00')+'.pptx')),24)
        Write-Output ('Created PowerPoint revision '+$i)
      }
      $presentation.SaveAs((Join-Path $resolvedFolder 'legacy.ppt'),1)
    } finally { $presentation.Close() }
  } else {
    foreach($item in Get-ChildItem -LiteralPath $resolvedFolder -File) {
      $filePath=$item.FullName; $before=(Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash
      switch($item.Extension.ToLowerInvariant()) {
        {$_ -in '.docx','.doc'} { $document=$word.Documents.Open($filePath,$false,$true); try { $count=$document.Paragraphs.Count } finally { $document.Close(0) }; break }
        {$_ -in '.xlsx','.xls'} { $book=$excel.Workbooks.Open($filePath,0,$true); try { $count=$book.Worksheets.Count } finally { $book.Close($false) }; break }
        {$_ -in '.pptx','.ppt'} { $presentation=$powerpoint.Presentations.Open($filePath,-1,0,0); try { $count=$presentation.Slides.Count } finally { $presentation.Close() }; break }
        default { continue }
      }
      $after=(Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash
      if($before -ne $after) { throw ('Read-only verification changed bytes: '+$item.Name) }
      $report.Add(@{name=$item.Name;opened=$true;count=$count;sha256=$after})
      Write-Output ('Opened and verified '+$item.Name)
    }
    $report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $resolvedFolder 'office-open-report.json') -Encoding UTF8
  }
} finally {
  if($word) { $word.Quit(); [Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null }
  if($excel) { $excel.Quit(); [Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel) | Out-Null }
  if($powerpoint) { if(-not $hadPowerPoint -and $powerpoint.Presentations.Count -eq 0) { $powerpoint.Quit() }; [Runtime.InteropServices.Marshal]::FinalReleaseComObject($powerpoint) | Out-Null }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
