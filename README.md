# Voice Volume Normalization Example

This is a demo to simulate the volume normalization process to protect against mic spammers. It applies the dynamics compressor with aggressive parameters and a hard limit gain to ensure the volume does not exceed a decibel threshold.

This also has the side effect of (sometimes) boosting quiet voices, although this is mostly untested.

## Running the example

```bash
# NOTE: Minimum of Python v3.10.12 needed
python3 -m http.server
```

Then navigate to http://localhost:8000 in your browser.
