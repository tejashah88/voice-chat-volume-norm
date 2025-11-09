/**
 * Audio visualizer for AudioWorklet-based hard limit processing
 * Displays input and output levels with diagnostic recording and live Chart.js graphs
 */
const ANALYSER_FFT_SIZE = 2048;
const ANALYSER_SMOOTHING = 0.3;

class AudioVisualizer {
  constructor(processor, audioElement = null) {
    this.processor = processor;
    this.audioElement = audioElement;
    this.animationId = null;
    this.onMetersUpdate = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;

    this.isRecording = false;
    this.recordingData = [];
    this.recordingStartTime = null;

    // Chart.js instance
    this.chart = null;
    this.chartData = {
      inputData: [],
      outputData: [],
      thresholdData: []
    };
    this.chartStartTime = 0;
    this.audioDuration = null;

    // Initialize chart immediately on construction
    this.initializeChart();
  }

  /**
   * Initialize analysers when processor is ready
   */
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

    this.processor.sourceNode.connect(this.inputAnalyser);
    this.processor.limiterNode.connect(this.outputAnalyser);
  }

  /**
   * Initialize Chart.js line chart
   */
  initializeChart() {
    // Don't initialize twice
    if (this.chart) return;

    const canvas = document.getElementById('audioChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Get audio duration if available
    if (this.audioElement && !isNaN(this.audioElement.duration)) {
      this.audioDuration = this.audioElement.duration;
    }

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Input Level',
            data: this.chartData.inputData,
            borderColor: '#3498db',
            backgroundColor: 'rgba(52, 152, 219, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0,
            fill: true
          },
          {
            label: 'Output Level',
            data: this.chartData.outputData,
            borderColor: '#e74c3c',
            backgroundColor: 'rgba(231, 76, 60, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0,
            fill: true
          },
          {
            label: 'Threshold',
            data: this.chartData.thresholdData,
            borderColor: '#95a5a6',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            type: 'linear',
            display: true,
            title: {
              display: true,
              text: 'Time (s)'
            },
            min: 0,
            max: this.audioDuration || 10,
            ticks: {
              maxTicksLimit: 10
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'Level (dB)'
            },
            min: -60,
            max: 0,
            ticks: {
              stepSize: 10
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            enabled: false
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
  }

  /**
   * Update chart data with new points
   */
  updateChart(inputDb, outputDb) {
    if (!this.chart) return;

    // Use audio element's current time if available, otherwise use elapsed time
    const currentTime = this.audioElement && !isNaN(this.audioElement.currentTime)
      ? this.audioElement.currentTime
      : (performance.now() - this.chartStartTime) / 1000;

    // Add new data point (using x,y objects for linear scale)
    this.chartData.inputData.push({ x: currentTime, y: inputDb });
    this.chartData.outputData.push({ x: currentTime, y: outputDb });
    this.chartData.thresholdData.push({ x: currentTime, y: this.processor.threshold });

    this.chart.update('none'); // Update without animation for performance
  }

  /**
   * Calculate RMS (Root Mean Square) for perceived loudness
   */
  calculateRMS(dataArray) {
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    return Math.sqrt(sumSquares / dataArray.length);
  }

  /**
   * Convert dB to percentage for bar height
   */
  dbToPercent(db, minDb = -60, maxDb = 0) {
    const percent = ((db - minDb) / (maxDb - minDb)) * 100;
    return Math.max(0, Math.min(100, percent));
  }

  /**
   * Main visualization loop - reads analysers and updates UI
   */
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

    const totalReductionDb = inputDb - outputDb;
    const totalReductionPercent = totalReductionDb > 0
      ? (1 - Math.pow(10, -totalReductionDb / 20)) * 100
      : 0;

    // Update chart
    this.updateChart(inputDb, outputDb);

    // Update stats display
    if (this.onMetersUpdate) {
      this.onMetersUpdate({
        inputDb: inputDb,
        inputPercent: this.dbToPercent(inputDb),
        outputDb: outputDb,
        outputPercent: this.dbToPercent(outputDb),
        reductionPercent: Math.max(0, totalReductionPercent),
      });
    }

    // Recording
    if (this.isRecording && this.recordingStartTime !== null) {
      const timestamp = performance.now() - this.recordingStartTime;
      this.recordingData.push({
        timestamp: timestamp.toFixed(2),
        inputDb: inputDb.toFixed(2),
        outputDb: outputDb.toFixed(2),
        threshold: this.processor.threshold.toFixed(2),
        reductionDb: totalReductionDb.toFixed(2),
        reductionPercent: totalReductionPercent.toFixed(2),
        aboveThreshold: inputDb > this.processor.threshold,
      });
    }

    this.animationId = requestAnimationFrame(() => this.updateMeters());
  }

  /**
   * Reconnect analyser taps after disable/enable
   */
  reconnectAnalysers() {
    if (!this.inputAnalyser || !this.processor.isActive) return;

    try {
      this.processor.sourceNode.connect(this.inputAnalyser);
      this.processor.limiterNode.connect(this.outputAnalyser);
    } catch (e) {
      console.error('[Visualizer] Error reconnecting analysers:', e);
    }
  }

  /**
   * Start visualization loop
   */
  start() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    this.chartStartTime = performance.now();
    this.initialize();
    this.reconnectAnalysers();
    this.updateMeters();
  }

  /**
   * Pause visualization loop without clearing data
   */
  pause() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Stop visualization loop and reset state
   */
  stop() {
    this.pause();

    if (this.onMetersUpdate) {
      this.onMetersUpdate({
        inputDb: -Infinity,
        inputPercent: 0,
        outputDb: -Infinity,
        outputPercent: 0,
        reductionPercent: 0,
      });
    }

    // Clear chart data in place (Chart.js holds references)
    if (this.chart) {
      this.chartData.inputData.length = 0;
      this.chartData.outputData.length = 0;
      this.chartData.thresholdData.length = 0;
      this.chart.update();
    }
  }

  /**
   * Update chart x-axis max when audio duration becomes available
   */
  updateAudioDuration() {
    if (this.audioElement && !isNaN(this.audioElement.duration)) {
      this.audioDuration = this.audioElement.duration;
      if (this.chart && this.chart.options.scales.x) {
        this.chart.options.scales.x.max = this.audioDuration;
        this.chart.update('none');
      }
    }
  }

  /**
   * Reset/clear chart data without stopping visualization
   * Works regardless of whether chart is initialized or audio is playing
   */
  resetChart() {
    // Clear arrays in place (Chart.js holds references to these arrays)
    this.chartData.inputData.length = 0;
    this.chartData.outputData.length = 0;
    this.chartData.thresholdData.length = 0;

    // Update chart if it exists
    if (this.chart) {
      this.chart.update();
    }
  }

  /**
   * Start recording diagnostic data
   */
  startRecording() {
    this.recordingData = [];
    this.recordingStartTime = performance.now();
    this.isRecording = true;
  }

  /**
   * Stop recording and return the collected data
   */
  stopRecording() {
    this.isRecording = false;
    return this.recordingData;
  }

  /**
   * Export recording data as downloadable CSV file
   */
  exportRecordingData(filename = 'audio-diagnostics.csv') {
    const data = this.stopRecording();

    if (data.length === 0) {
      console.warn('[Diagnostics] No data to export');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvHeader = headers.join(',');

    const csvRows = data.map(entry => {
      return headers.map(header => {
        const value = entry[header];
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value}"`;
        }
        return value;
      }).join(',');
    });

    const csvContent = [csvHeader, ...csvRows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
