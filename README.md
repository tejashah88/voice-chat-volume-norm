# Voice Volume Normalization Example

This is a demo to simulate the volume normalization process to protect against mic spammers. It applies the dynamics compressor with aggressive parameters and a hard limit gain to ensure the volume does not exceed a decibel threshold. This also has the side effect of adding makeup gain, which can (sometimes) boost quiet voices. See the [Web Audio API specification](https://webaudio.github.io/web-audio-api/#DynamicsCompressorOptions-processing) on the processing specifics for more details.

Credits go to Claude Sonnet 4.5 for helping with the Web Audio API explanations and starting implementation.

## Running the example

```bash
# NOTE: Minimum of Python v3.10.12 needed
python3 -m http.server
```

Then navigate to http://localhost:8000 in your browser.

## How It Works

1. **DynamicsCompressorNode (Stage 1)**: Applies dynamics compression using the Web Audio API's built-in compressor with aggressive limiting parameters optimized for voice. This does the heavy lifting since its often used for web video games or music where multiple sound effects can be overlaid and cause distortion and discomfort on the ears.

   **Compressor Parameters:**
   - **Threshold**: -20 dB (default, adjustable via UI) - The volume ceiling. Any audio above this level will be compressed.
   - **Knee**: 0 dB - Hard knee for brick-wall limiting. Creates a sharp transition at the threshold rather than a gradual one.
   - **Ratio**: 20:1 - Very high ratio for aggressive limiting. For every 20 dB over the threshold, only 1 dB comes through.
   - **Attack**: 3ms (0.003s) - Fast but not instant attack time to prevent audible clicks while quickly catching loud transients.
   - **Release**: 100ms (0.1s) - Smooth release time for natural-sounding decay that maintains speech rhythm.

   **Automatic Makeup Gain:**
   Per the Web Audio API specification, the compressor includes automatic makeup gain - "a fixed gain stage that only depends on ratio, knee and threshold parameter of the compressor, and not on the input signal." The makeup gain is calculated as: `(1 / full_range_gain)^0.6`, where `full_range_gain` is the result of applying the compression curve to the value 1.0. This makeup gain compensates for compression by boosting the overall signal level, which affects both loud AND quiet sounds.

2. **Hard Limiter Gain (Stage 2)**: Ensures the volume never exceeds the given threshold from the dynamics compressor by continuously monitoring its output and applying additional gain reduction if needed. This can happen if the sounds are abnormally loud and acts as a safety net, at the cost of some distortion.

   **AnalyserNode Configuration:**
   - **FFT Size**: 2048 samples - The window size to analyze the audio samples.
   - **Smoothing**: 0.3 - Applied smoothing that averages current measurement with previous values to reduce jitter. Range is from 0.0 to 1.0.

   **Computation Steps (runs every animation frame):**
   1. **Sample Capture**: Retrieves time-domain samples from the compressor output
   2. **RMS Calculation**: Computes Root Mean Square for perceived loudness: `RMS = sqrt(Σ(sample²) / sample_count)`
   3. **dB Conversion**: Converts RMS to decibels: `dB = 20 × log₁₀(RMS)` (or -100 dB if RMS ≈ 0)
   4. **Threshold Check**: If `dB > threshold`:
      - Calculate required gain reduction: `gain_dB = threshold - current_dB`
      - Convert to linear gain: `gain = 10^(gain_dB / 20)`
      - Apply to limiter gain node (reduces volume)
   5. **Pass-through**: If `dB ≤ threshold`, set gain to 1.0 (unity gain, no change)
