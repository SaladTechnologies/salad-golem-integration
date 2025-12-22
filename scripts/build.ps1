#!/usr/bin/env pwsh
<#
    .SYNOPSIS
    Builds and pushes the OCI image and updates the Argo CD deployment.

    .DESCRIPTION
    The `build.ps1` script builds and pushes the OCI image and updates the Argo CD deployment.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param()

#Requires -Version 7
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
Push-Location -Path $projectRoot
try {
    $tag = (git rev-parse --short=7 HEAD).Trim()
    $projects = @(
        @{ Path = 'orchestrator'; Repo = 'saladtechnologies/golem-orchestrator' },
        @{ Path = 'plan-importer'; Repo = 'saladtechnologies/golem-plan-importer' },
        @{ Path = 'price-importer'; Repo = 'saladtechnologies/golem-price-importer' }
    )
    foreach ($project in $projects) {
        Write-Host -Object "Building and pushing $($project.Repo):$tag"
        Push-Location -Path $project.Path
        try {
            docker build -t "$($project.Repo):$tag" .
            docker push "$($project.Repo):$tag"
        }
        finally {
            Pop-Location
        }
    }

    $valuesPath = Join-Path -Path $projectRoot -ChildPath 'cluster/apps/golem-orchestrator/values.yaml'
    $valuesContent = Get-Content -Path $valuesPath
    $tagPattern = "^(\s*['`"]?tag['`"]?\s*:\s*).*$"
    $tagUpdated = $false
    for ($i = 0; $i -lt $valuesContent.Count; $i++) {
        if (-not $tagUpdated -and $valuesContent[$i] -match $tagPattern) {
            $prefix = $matches[1]
            $valuesContent[$i] = "$prefix`"$tag`""
            $tagUpdated = $true
        }
    }
    if ($tagUpdated) {
        Set-Content -Path $valuesPath -Value $valuesContent
    }
}
finally {
	Pop-Location
}
