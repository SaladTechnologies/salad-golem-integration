#!/usr/bin/env pwsh
<#
    .SYNOPSIS
    Deploys all Kubernetes resources in the `resources` directory to the cluster associated with the current context.

    .DESCRIPTION
    The `Deploy-Resource.ps1` script deploys all Kubernetes resources in the `resources` directory to the cluster
    associated with the current context. This will only create or update resources. This will not delete any resources.
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
    Get-ChildItem -Path .\resources -File -Filter '*.yaml' | ForEach-Object -Process {
        Write-Host -Object "kubectl apply -f $($_.FullName)" -ForegroundColor Cyan
        if ($PSCmdlet.ShouldProcess("kubectl apply -f $($_.FullName)", '', '')) {
            & kubectl apply -f $_.FullName
        }
    }
}
finally {
    Pop-Location
}
