/**
 * AudioWorklet-based voice volume normalizer with lookahead limiting
 * Uses hard limiting without gain boost - runs at audio rate (48kHz)
 */
class VoiceVolumeNormalizer {
  constructor(threshold) {
    this.audioCtx = null;
    this.sourceNode = null;
    this.destinationNode = null;
    this.limiterNode = null;
    this.threshold = threshold;
    this.attackTime = 15; // ms
    this.releaseTime = 80; // ms
    this.rmsWindow = 5; // ms
    this.isActive = false;
    this.isWorkletLoaded = false;
  }

  /**
   * Initialize with an audio context and load the AudioWorklet module
   */
  async initialize(audioContext) {
    if (this.audioCtx) return;

    this.audioCtx = audioContext;

    try {
      await this.audioCtx.audioWorklet.addModule('src/limiter-worklet.js');
      this.isWorkletLoaded = true;
    } catch (error) {
      console.error('[AudioWorklet] Failed to load limiter worklet:', error);
      this.isWorkletLoaded = false;
      throw new Error('Failed to load AudioWorklet processor. Make sure you are running from a web server (not file://).');
    }

    try {
      this.limiterNode = new AudioWorkletNode(this.audioCtx, 'limiter-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      // Apply all stored parameters
      this.updateParameters({
        threshold: this.threshold,
        attackTime: this.attackTime,
        releaseTime: this.releaseTime,
        rmsWindow: this.rmsWindow
      });
    } catch (error) {
      console.error('[AudioWorklet] Failed to create limiter node:', error);
      throw new Error('Failed to create AudioWorklet node.');
    }
  }

  /**
   * Enable audio processing with specified source and destination nodes
   */
  enable(sourceNode, destinationNode) {
    if (!this.audioCtx || !this.isWorkletLoaded || !this.limiterNode) {
      console.error('[AudioWorklet] Cannot enable: worklet not properly initialized');
      return;
    }

    if (this.isActive) return;

    this.sourceNode = sourceNode;
    this.destinationNode = destinationNode;

    try {
      this.sourceNode.disconnect(this.destinationNode);
    } catch (e) {
      // Ignore if already disconnected
    }

    this.sourceNode.connect(this.limiterNode);
    this.limiterNode.connect(this.destinationNode);

    this.isActive = true;
  }

  /**
   * Disable audio processing (bypass mode)
   */
  disable() {
    if (!this.audioCtx || !this.isActive || !this.sourceNode || !this.destinationNode) {
      return;
    }

    try {
      this.sourceNode.disconnect(this.limiterNode);
      this.limiterNode.disconnect();
    } catch (e) {
      console.error('[AudioWorklet] Error disconnecting:', e);
    }

    this.sourceNode.connect(this.destinationNode);

    this.isActive = false;
  }

  /**
   * Update limiter parameters
   * Stores values immediately and applies to limiter node if initialized
   */
  updateParameters({ threshold, attackTime, releaseTime, rmsWindow } = {}) {
    const params = {};

    // Always store values in instance variables
    if (threshold !== undefined) {
      this.threshold = threshold;
      params.threshold = threshold;
    }

    if (attackTime !== undefined) {
      this.attackTime = attackTime;
      params.attackTime = attackTime / 1000;
    }

    if (releaseTime !== undefined) {
      this.releaseTime = releaseTime;
      params.releaseTime = releaseTime / 1000;
    }

    if (rmsWindow !== undefined) {
      this.rmsWindow = rmsWindow;
      params.rmsWindow = rmsWindow / 1000;
    }

    // Apply to limiter node if it exists
    if (this.limiterNode && Object.keys(params).length > 0) {
      this.limiterNode.port.postMessage({
        type: 'updateParameters',
        ...params
      });
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.isActive) {
      this.disable();
    }

    if (this.limiterNode) {
      this.limiterNode.disconnect();
      this.limiterNode = null;
    }

    this.audioCtx = null;
    this.sourceNode = null;
    this.destinationNode = null;
    this.isWorkletLoaded = false;
  }
}
