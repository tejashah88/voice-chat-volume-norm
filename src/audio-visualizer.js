// Audio processing constants
const ANALYSER_FFT_SIZE = 2048;
const ANALYSER_SMOOTHING = 0.3;

// Handles real-time visualization of audio levels
class AudioVisualizer {
  constructor(processor) {
    this.processor = processor;
    this.animationId = null;
    this.onMetersUpdate = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
  }

  // Initialize analysers when processor is ready
  initialize() {
    if (!this.processor.audioCtx || this.inputAnalyser) return;

    this.inputAnalyser = new AnalyserNode(this.processor.audioCtx, {
      fftSize: ANALYSER_FFT_SIZE,
      smoothingTimeConstant: ANALYSER_SMOOTHING,
    });
    this.outputAnalyser = new AnalyserNode(this.processor.audioCtx, {
      fftSize: ANALYSER_FFT_SIZE,
      smoothingTimeConstant: ANALYSER_SMOOTHING,
    });

    // Connect analysers in parallel to tap into audio chain
    this.processor.sourceNode.connect(this.inputAnalyser);
    this.processor.limiterGain.connect(this.outputAnalyser);
  }

  // Calculate RMS (Root Mean Square) for perceived loudness
  calculateRMS(dataArray) {
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    return Math.sqrt(sumSquares / dataArray.length);
  }

  // Convert dB to percentage for bar height
  dbToPercent(db, minDb = -60, maxDb = 0) {
    const percent = ((db - minDb) / (maxDb - minDb)) * 100;
    return Math.max(0, Math.min(100, percent));
  }

  // Main visualization loop - reads analysers and updates UI
  updateMeters() {
    if (!this.inputAnalyser || !this.outputAnalyser || !this.processor.isActive) {
      return;
    }

    const inputData = new Float32Array(this.inputAnalyser.fftSize);
    const outputData = new Float32Array(this.outputAnalyser.fftSize);

    this.inputAnalyser.getFloatTimeDomainData(inputData);
    this.outputAnalyser.getFloatTimeDomainData(outputData);

    const inputRMS = this.calculateRMS(inputData);
    const outputRMS = this.calculateRMS(outputData);

    const inputDb = 20 * Math.log10(inputRMS || 1e-5);
    const outputDb = 20 * Math.log10(outputRMS || 1e-5);

    this.processor.updateLimiter();

    const totalReductionDb = inputDb - outputDb;
    const totalReductionPercent = totalReductionDb > 0
      ? (1 - Math.pow(10, -totalReductionDb / 20)) * 100
      : 0;

    if (this.onMetersUpdate) {
      this.onMetersUpdate({
        inputDb: inputDb,
        outputDb: outputDb,
        inputPercent: this.dbToPercent(inputDb),
        outputPercent: this.dbToPercent(outputDb),
        reductionPercent: Math.max(0, totalReductionPercent),
      });
    }

    this.animationId = requestAnimationFrame(() => this.updateMeters());
  }

  // Start visualization loop
  start() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    this.initialize();
    this.updateMeters();
  }

  // Stop visualization loop and reset state
  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.onMetersUpdate) {
      this.onMetersUpdate({
        inputDb: -Infinity,
        outputDb: -Infinity,
        inputPercent: 0,
        outputPercent: 0,
        reductionPercent: 0,
      });
    }
  }
}
