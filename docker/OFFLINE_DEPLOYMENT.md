# Offline/Disconnected Deployment Guide

This document explains how AnythingLLM handles dependencies in disconnected environments and what has been pre-downloaded during the container build.

## Overview

For deployments in air-gapped or disconnected environments, all external dependencies must be bundled in the container image at build time. This document covers what has been configured and what dependencies are included.

## AI Models (Pre-Downloaded)

All AI models used for RAG operations are pre-downloaded during container build and cached in `/app/server/storage/models`.

### 1. Embedding Models (Required for Document Vectorization)

**Default Model:**
- `Xenova/all-MiniLM-L6-v2` (23MB)
  - Used for converting text to vector embeddings
  - Required for document ingestion and similarity search

**Optional Models** (commented out by default):
- `Xenova/nomic-embed-text-v1` (139MB) - Higher performance, larger context window
- `MintplexLabs/multilingual-e5-small` (487MB) - Multilingual support for 100+ languages

To include optional models, edit `docker/download-models.js` and uncomment the desired models before building.

### 2. Whisper Models (Required for Audio Transcription)

**Default Model:**
- `Xenova/whisper-small` (250MB)
  - Used for speech-to-text transcription
  - Required when uploading audio files

**Optional Model** (commented out by default):
- `Xenova/whisper-large` (1.56GB) - More accurate but slower and larger

### 3. Reranker Models (Required for Search Result Optimization)

**Default Model:**
- `Xenova/ms-marco-MiniLM-L-6-v2` (~80MB)
  - Used to rerank search results for better relevance
  - Improves RAG retrieval accuracy

## Other Dependencies (Pre-Downloaded at Build Time)

### Puppeteer (Web Scraping)

**Status:** ✅ Already handled in Containerfile

Chrome browser binaries are downloaded during container build:
- Environment: `PUPPETEER_DOWNLOAD_BASE_URL=https://storage.googleapis.com/chrome-for-testing-public`
- Cache directory: `/tmp/.puppeteer-cache`
- Downloads during: `yarn install` in collector stage

No runtime downloads occur.

### Sharp (Image Processing)

**Status:** ✅ Already handled via yarn install

Native libvips binaries are downloaded during container build:
- Installed via: `yarn install` in collector stage
- Platform-specific binaries bundled for linux/amd64
- No runtime downloads occur

## Configuration for Offline Deployment

### Building the Container

The container build process automatically downloads all required models:

```bash
podman build --platform linux/amd64 -t anythingllm:fips -f docker/Containerfile . --no-cache
```

During build, you'll see output like:

```
╔══════════════════════════════════════════════════════════════════════╗
║  Pre-downloading AI models for offline deployment                   ║
╚══════════════════════════════════════════════════════════════════════╝

📦 Downloading 3 model(s) (~353MB total)

📥 Model: Xenova/all-MiniLM-L6-v2
   Type: feature-extraction
   Size: 23MB
...
```

### Environment Variables

No special environment variables are needed for offline operation. The models are automatically detected and used from the cache.

### Optional: Download All Models

To include all optional models (multilingual, larger Whisper, etc.), set this environment variable during build:

```bash
podman build --platform linux/amd64 \
  --build-arg DOWNLOAD_ALL_MODELS=true \
  -t anythingllm:fips-full \
  -f docker/Containerfile .
```

This will download:
- All embedding models (23MB + 139MB + 487MB = 649MB)
- All Whisper models (250MB + 1.56GB = 1.81GB)
- All reranker models (80MB)

**Total: ~2.5GB of models**

## Verifying Offline Operation

### 1. Check Model Cache

After deployment, verify models are present:

```bash
oc exec -n <namespace> <pod-name> -- ls -lh /app/server/storage/models
```

You should see directories:
- `Xenova/all-MiniLM-L6-v2/`
- `Xenova/whisper-small/`
- `Xenova/ms-marco-MiniLM-L-6-v2/`

### 2. Test Document Embedding

Upload a document through the UI. If models are cached correctly, you'll see:

```
[NativeEmbedder] Initialized Xenova/all-MiniLM-L6-v2
[NativeEmbedder] Embedded Chunk Group 1 of 1
```

**No download messages should appear.**

### 3. Test Audio Transcription

Upload an audio file. You should see:

```
[LocalWhisper] Initialized.
```

**No "downloading model" messages should appear.**

### 4. Test Search Reranking

When performing searches with reranking enabled, you should see:

```
[NativeEmbeddingReranker] Initialized
[NativeEmbeddingReranker] Reranking 10 documents to top 4 took 1200ms
```

## Troubleshooting

### Model Download Fails During Build

**Symptom:** Build fails with `Failed to download model` error

**Solution:**
1. Check internet connectivity during build
2. Verify HuggingFace.co is not blocked by firewall
3. The script has a fallback CDN (`cdn.anythingllm.com`) that may work if HuggingFace is blocked

### Models Not Found at Runtime

**Symptom:** Application tries to download models despite being in container

**Solution:**
1. Verify build completed successfully: `podman images | grep anythingllm`
2. Check model cache in container: `podman run -it <image> ls -lh /app/server/storage/models`
3. Ensure `STORAGE_DIR` environment variable is not overriding the default path

### Permission Errors

**Symptom:** Cannot read model files in OpenShift

**Solution:**
Models directory has OpenShift-compatible permissions (GID 0, g+rwX). If issues persist:
1. Check pod is running with arbitrary UID
2. Verify SecurityContextConstraints allow the deployment
3. Check group permissions: `ls -la /app/server/storage/models`

## Maintenance

### Updating Models

To update to newer model versions:

1. Edit `docker/download-models.js`
2. Update model names/versions in the configuration arrays
3. Rebuild the container image
4. Redeploy to OpenShift

### Adding New Models

To add additional models:

1. Edit `docker/download-models.js`
2. Add model to appropriate array (EMBEDDING_MODELS, WHISPER_MODELS, or RERANKER_MODELS)
3. Set `required: true` for mandatory models, `required: false` for optional
4. Rebuild container

Example:
```javascript
const EMBEDDING_MODELS = [
  { name: "Xenova/all-MiniLM-L6-v2", size: "23MB", type: "feature-extraction", required: true },
  { name: "your/custom-model", size: "100MB", type: "feature-extraction", required: false },
];
```

## Storage Requirements

### Minimal (Default Configuration)
- Embedding: 23MB
- Whisper: 250MB
- Reranker: 80MB
- **Total: ~353MB**

### Full (All Optional Models Enabled)
- Embeddings: 649MB
- Whisper: 1.81GB
- Reranker: 80MB
- **Total: ~2.5GB**

Plan persistent storage accordingly when deploying to OpenShift.

## Related Files

- `docker/download-models.js` - Model download script
- `docker/Containerfile` - Container build instructions
- `server/utils/EmbeddingEngines/native/index.js` - Embedding engine implementation
- `server/utils/EmbeddingRerankers/native/index.js` - Reranker implementation
- `collector/utils/WhisperProviders/localWhisper.js` - Whisper implementation
