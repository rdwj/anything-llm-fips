#!/bin/bash
# Script to create OpenShift manifests directory structure

mkdir -p manifests/base
mkdir -p manifests/overlays/dev
mkdir -p manifests/overlays/prod

echo "Created OpenShift manifests directory structure:"
tree manifests/ || find manifests/ -type d
