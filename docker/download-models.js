#!/usr/bin/env node
/**
 * Pre-download AI models for offline/disconnected environments
 *
 * This script downloads the native models that AnythingLLM uses for RAG:
 * - Embedding models (for document vectorization)
 * - Whisper models (for audio transcription)
 * - Reranker models (for improving search results)
 *
 * All models are bundled in the container image to avoid runtime downloads
 * from HuggingFace in disconnected environments.
 */

const path = require("path");
const fs = require("fs");

/**
 * Model Configuration
 * Adjust these arrays based on your requirements and available disk space
 */

// Embedding models (from server/utils/EmbeddingEngines/native/constants.js)
const EMBEDDING_MODELS = [
  { name: "Xenova/all-MiniLM-L6-v2", size: "23MB", type: "feature-extraction", required: true },
  // Additional embedding models for better performance and multilingual support:
  { name: "Xenova/nomic-embed-text-v1", size: "139MB", type: "feature-extraction", required: false },
  { name: "MintplexLabs/multilingual-e5-small", size: "487MB", type: "feature-extraction", required: false },
];

// Whisper models for audio transcription (from collector/utils/WhisperProviders/localWhisper.js)
const WHISPER_MODELS = [
  { name: "Xenova/whisper-small", size: "250MB", type: "automatic-speech-recognition", required: true },
  // Larger, more accurate model:
  { name: "Xenova/whisper-large", size: "1.56GB", type: "automatic-speech-recognition", required: false },
];

// Reranker models for improving search results (from server/utils/EmbeddingRerankers/native/index.js)
const RERANKER_MODELS = [
  { name: "Xenova/ms-marco-MiniLM-L-6-v2", size: "~80MB", type: "text-classification", required: true },
];

// Combine all models
const MODELS_TO_DOWNLOAD = [
  ...EMBEDDING_MODELS,
  ...WHISPER_MODELS,
  ...RERANKER_MODELS,
].filter(model => model.required || process.env.DOWNLOAD_ALL_MODELS === "true");

async function downloadModels() {
  console.log("╔" + "═".repeat(70) + "╗");
  console.log("║  Pre-downloading AI models for offline deployment                 ║");
  console.log("╚" + "═".repeat(70) + "╝\n");

  // Determine cache directory (same logic as NativeEmbedder)
  const cacheDir = process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR, "models")
    : path.resolve(__dirname, "../server/storage/models");

  console.log(`📁 Cache directory: ${cacheDir}\n`);

  // Create cache directory if it doesn't exist
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    console.log(`✓ Created cache directory\n`);
  }

  let totalModels = MODELS_TO_DOWNLOAD.length;
  let downloadedModels = 0;
  let totalSize = MODELS_TO_DOWNLOAD.reduce((sum, model) => {
    // Extract size in MB (approximate)
    const sizeMatch = model.size.match(/(\d+(?:\.\d+)?)\s*(MB|GB)/i);
    if (sizeMatch) {
      const value = parseFloat(sizeMatch[1]);
      const unit = sizeMatch[2].toUpperCase();
      return sum + (unit === "GB" ? value * 1024 : value);
    }
    return sum;
  }, 0);

  console.log(`📦 Downloading ${totalModels} model(s) (~${Math.round(totalSize)}MB total)\n`);

  for (const model of MODELS_TO_DOWNLOAD) {
    console.log(`${"─".repeat(70)}`);
    console.log(`📥 Model: ${model.name}`);
    console.log(`   Type: ${model.type}`);
    console.log(`   Size: ${model.size}`);
    console.log(`${"─".repeat(70)}\n`);

    try {
      if (model.type === "text-classification") {
        // Reranker models need special handling
        await downloadRerankerModel(model, cacheDir);
      } else {
        // Embedding and Whisper models use pipeline
        await downloadPipelineModel(model, cacheDir);
      }

      downloadedModels++;
      console.log(`\n✓ Successfully downloaded: ${model.name} (${downloadedModels}/${totalModels})\n`);

    } catch (error) {
      console.error(`\n✗ Failed to download ${model.name}:`, error.message);
      if (model.required) {
        console.error(`\n✗ FATAL: Required model failed to download. Exiting.`);
        process.exit(1);
      } else {
        console.warn(`\n⚠ Optional model failed to download. Continuing...\n`);
      }
    }
  }

  console.log("\n" + "═".repeat(70));
  console.log("✓ Model download complete!");
  console.log("═".repeat(70));
  console.log(`\n📁 Models cached in: ${cacheDir}`);

  // List downloaded models
  console.log("\n📋 Downloaded models:");
  for (const model of MODELS_TO_DOWNLOAD) {
    const modelPath = path.resolve(cacheDir, ...model.name.split("/"));
    const exists = fs.existsSync(modelPath);
    console.log(`  ${exists ? "✓" : "✗"} ${model.name} (${model.size})`);
  }
  console.log("");
}

/**
 * Download pipeline-based models (embeddings, whisper)
 */
async function downloadPipelineModel(model, cacheDir) {
  const { pipeline } = await import("@xenova/transformers");

  const modelPipeline = await pipeline(model.type, model.name, {
    cache_dir: cacheDir,
    progress_callback: (data) => {
      if (!data.hasOwnProperty("progress")) return;
      console.log(`  → ${data.file} ${Math.round(data.progress)}%`);
    },
  });

  // Clean up to free memory
  modelPipeline.dispose && modelPipeline.dispose();
}

/**
 * Download reranker models (uses AutoModel instead of pipeline)
 */
async function downloadRerankerModel(model, cacheDir) {
  const { AutoModelForSequenceClassification, AutoTokenizer } =
    await import("@xenova/transformers");

  const progressCallback = (data) => {
    if (!data.hasOwnProperty("progress")) return;
    console.log(`  → ${data.file} ${Math.round(data.progress)}%`);
  };

  // Download both model and tokenizer
  console.log("  Downloading model...");
  const rerankerModel = await AutoModelForSequenceClassification.from_pretrained(
    model.name,
    { cache_dir: cacheDir, progress_callback: progressCallback }
  );

  console.log("  Downloading tokenizer...");
  const tokenizer = await AutoTokenizer.from_pretrained(
    model.name,
    { cache_dir: cacheDir, progress_callback: progressCallback }
  );

  // Clean up
  rerankerModel.dispose && rerankerModel.dispose();
}

// Run the download
downloadModels().catch((error) => {
  console.error("Fatal error during model download:", error);
  process.exit(1);
});
