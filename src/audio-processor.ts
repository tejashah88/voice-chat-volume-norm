// Audio processing constants
const COMPRESSOR_KNEE = 0; // Hard knee for brick-wall limiting
const COMPRESSOR_RATIO = 20; // Very high ratio for aggressive limiting
const COMPRESSOR_ATTACK = 0.003; // 3ms - fast but not instant (prevents clicks)
const COMPRESSOR_RELEASE = 0.1; // 100ms - smooth release for natural sound

// Parameter interface for updating compressor settings
interface CompressorParameters {
  threshold?: number;
  ratio?: number;
  attack?: number;
  release?: number;
}

// Hybrid audio limiter using compressor + hard ceiling
class VoiceVolumeNormalizer {
  private audioCtx: AudioContext | null;
  private sourceNode: AudioNode | null;
  private destinationNode: AudioNode | null;
  private compressor: DynamicsCompressorNode | null;
  private compressorAnalyser: AnalyserNode | null;
  private limiterGain: GainNode | null;
  private threshold: number;
  private isActive: boolean;
  private animationFrameId: number | null;

  constructor(threshold: number) {
    this.audioCtx = null;
    this.sourceNode = null;
    this.destinationNode = null;
    this.compressor = null;
    this.compressorAnalyser = null;
    this.limiterGain = null;
    this.threshold = threshold;
    this.isActive = false;
    this.animationFrameId = null;
  }

  // Initialize with an audio context and create internal processing nodes
  initialize(audioContext: AudioContext): void {
    if (this.audioCtx) return;

    this.audioCtx = audioContext;

    this.compressor = new DynamicsCompressorNode(this.audioCtx, {
      threshold: this.threshold,
      knee: COMPRESSOR_KNEE,
      ratio: COMPRESSOR_RATIO,
      attack: COMPRESSOR_ATTACK,
      release: COMPRESSOR_RELEASE,
    });

    this.compressorAnalyser = new AnalyserNode(this.audioCtx, {
      fftSize: 2048,
      smoothingTimeConstant: 0.3,
    });

    this.limiterGain = new GainNode(this.audioCtx, {
      gain: 1.0,
    });
  }

  // Enable audio processing with specified source and destination nodes
  enable(sourceNode: AudioNode, destinationNode: AudioNode): void {
    if (!this.audioCtx || this.isActive) return;

    // Store the nodes for later use (re-enabling, disabling)
    this.sourceNode = sourceNode;
    this.destinationNode = destinationNode;

    // Disconnect source from any previous connections
    try {
      this.sourceNode.disconnect(this.destinationNode);
    } catch (e) {
      // Ignore if already disconnected
    }

    // Connect processing chain: source → compressor → compressorAnalyser → limiterGain → destination
    this.sourceNode.connect(this.compressor!);
    this.compressor!.connect(this.compressorAnalyser!);
    this.compressorAnalyser!.connect(this.limiterGain!);
    this.limiterGain!.connect(this.destinationNode);

    this.isActive = true;
    this.startUpdateLoop();
  }

  // Disable audio processing (bypass)
  disable(): void {
    if (!this.audioCtx || !this.isActive || !this.sourceNode || !this.destinationNode) return;

    this.stopUpdateLoop();

    // Disconnect all processing nodes
    try {
      this.sourceNode.disconnect(this.compressor!);
      this.compressor!.disconnect();
      this.compressorAnalyser!.disconnect();
      this.limiterGain!.disconnect();
    } catch (e) {
      // Ignore if already disconnected
    }

    // Reconnect source directly to destination (bypass mode)
    this.sourceNode.connect(this.destinationNode);

    this.isActive = false;
  }

  // Start the update loop for the limiter
  private startUpdateLoop(): void {
    const update = (): void => {
      this.updateLimiter();
      if (this.isActive) {
        this.animationFrameId = requestAnimationFrame(update);
      }
    };
    this.animationFrameId = requestAnimationFrame(update);
  }

  // Stop the update loop
  private stopUpdateLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // Update compressor parameters
  updateParameters({ threshold, ratio, attack, release }: CompressorParameters = {}): void {
    if (!this.compressor) return;

    if (threshold !== undefined) {
      this.threshold = threshold;
      this.compressor.threshold.value = threshold;
    }
    if (ratio !== undefined) {
      this.compressor.ratio.value = ratio;
    }
    if (attack !== undefined) {
      this.compressor.attack.value = attack / 1000; // Convert ms to seconds
    }
    if (release !== undefined) {
      this.compressor.release.value = release / 1000; // Convert ms to seconds
    }
  }

  // Update hard ceiling limiter based on compressor output
  private updateLimiter(): void {
    if (!this.compressorAnalyser || !this.limiterGain || !this.isActive) {
      return;
    }

    const compressorData = new Float32Array(this.compressorAnalyser.fftSize);
    this.compressorAnalyser.getFloatTimeDomainData(compressorData);

    let sumSquares = 0;
    for (let i = 0; i < compressorData.length; i++) {
      sumSquares += compressorData[i] * compressorData[i];
    }
    const compressorRMS = Math.sqrt(sumSquares / compressorData.length);
    const compressorDb = 20 * Math.log10(compressorRMS || 1e-5);

    if (compressorDb > this.threshold) {
      const gainDb = this.threshold - compressorDb;
      const targetGain = Math.pow(10, gainDb / 20);
      this.limiterGain.gain.value = targetGain;
    } else {
      this.limiterGain.gain.value = 1.0;
    }
  }
}

export { VoiceVolumeNormalizer, CompressorParameters };
