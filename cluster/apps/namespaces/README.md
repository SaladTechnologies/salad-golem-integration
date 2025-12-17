# Kubernetes Namespaces

This directory contains the plain Kubernetes manifests used to deploy the cluster namespaces. The deployment is automated via Argo CD. Notably, Argo CD is configured to automatically synchronize this app first. This ensures namespaces are created before any other apps.

> [!CAUTION]
> Deleting a manifest will delete the namespace and all of its resources!
