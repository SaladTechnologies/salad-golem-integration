#!/usr/bin/env pwsh
<#
    .SYNOPSIS
    Deploys the orchestrator to the Kubernetes cluster associated with the current context.

    .DESCRIPTION
    The `Deploy-Orchestrator.ps1` script deploys the orchestrator to the Kubernetes cluster associated with the current
    context.
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
    Push-Location -Path .\apps\orchestrator
    try {
        # Deploy orchestrator
        Write-Host -Object 'Deploying orchestrator...' -ForegroundColor Green

        Write-Host -Object ('helm upgrade --hide-notes --history-max 1 --install --namespace golem-infrastructure ' +
            '--reset-values prod .') -ForegroundColor Cyan
        if ($PSCmdlet.ShouldProcess('helm upgrade --hide-notes --history-max 1 --install --namespace ' +
                'golem-infrastructure --reset-values prod .', '', '')) {
            & helm upgrade --hide-notes --history-max 1 --install --namespace golem-infrastructure --reset-values prod .
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    Pop-Location
}
