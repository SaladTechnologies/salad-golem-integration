#!/usr/bin/env pwsh
<#
    .SYNOPSIS
    Deploys requestors to the Kubernetes cluster associated with the current context.

    .DESCRIPTION
    The `Deploy-Requestor.ps1` script deploys requestors to the Kubernetes cluster associated with the current context.
    This will also remove any obsolete requestors.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '')]
param()

#Requires -Version 7
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
Push-Location -Path $projectRoot
try {
    Push-Location -Path .\apps\requestor
    try {
        # Deploy requestors
        Write-Host -Object 'Deploying requestors...' -ForegroundColor Green

        Get-ChildItem -Path .\deployments -Directory | ForEach-Object -Process {
            Write-Host -Object ('helm upgrade --hide-notes --history-max 1 --install --namespace golem-requestors ' +
                "--reset-values $($_.Name) .") -ForegroundColor Cyan
            if ($PSCmdlet.ShouldProcess('helm upgrade --hide-notes --history-max 1 --install --namespace ' +
                    "golem-requestors --reset-values $($_.Name) .", '', '')) {
                & helm upgrade --hide-notes --history-max 1 --install --namespace golem-requestors --reset-values `
                    $_.Name .
            }
        }

        # Remove obsolete requestors
        Write-Host -Object 'Removing obsolete requestors...' -ForegroundColor Green

        Write-Host -Object 'helm list --namespace golem-requestors --output json' -ForegroundColor Cyan
        $releasesJson = & helm list --namespace golem-requestors --output json
        $releases = @()
        if ($releasesJson) {
            $releases = ($releasesJson | ConvertFrom-Json) |
                Where-Object { $_.name } |
                Select-Object -ExpandProperty name
        }

        $deployments = Get-ChildItem -Path .\deployments -Directory | Select-Object -ExpandProperty Name
        $releases |
            Where-Object -FilterScript { $deployments -notcontains $_ } |
            ForEach-Object -Process {
                Write-Host -Object "helm uninstall $_ --namespace golem-requestors" -ForegroundColor Cyan
                if ($PSCmdlet.ShouldProcess("helm uninstall $_ --namespace golem-requestors", '', '')) {
                    & helm uninstall $_ --namespace golem-requestors
                }
            }
    }
    finally {
        Pop-Location
    }
}
finally {
    Pop-Location
}
