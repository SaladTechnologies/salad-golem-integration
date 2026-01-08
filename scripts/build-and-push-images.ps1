param(
    [Parameter(Mandatory=$true)]
    [string]$CommitHash
)

if (-not $CommitHash -or $CommitHash.Length -lt 7) {
    Write-Host "Commit hash must be at least 7 characters." -ForegroundColor Red
    exit 1
}
$Tag = $CommitHash.Substring(0,7)

$folders = @("plan-importer", "orchestrator", "price-importer")
$dockerRepo = "saladtechnologies" # Replace with your Docker Hub repo or registry

foreach ($folder in $folders) {
    $imageName = "$dockerRepo/golem-${folder}:$Tag"
    Write-Host "Building image $imageName in $folder..."
    Push-Location $folder
    docker build --tag $imageName .
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed for $folder" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Write-Host "Pushing image $imageName..."
    docker push $imageName
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Push failed for $folder" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "Done with $folder.`n"
}