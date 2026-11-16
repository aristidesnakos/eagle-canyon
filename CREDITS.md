# Credits

## Abyssal Garden (MIT)

Eagle Canyon starts from **[Abyssal Garden](https://github.com/Noniv/abyssal-garden)** by Noniv (Maksymilian Dendura), a WebGPU underwater
fly-through, under the MIT licence. Its licence notice is kept in [`LICENSE`](LICENSE) and must stay with any copy.
The first commit of this repository is Abyssal Garden unchanged.

What is still Abyssal Garden's, adapted:

- the build: `source/build.mjs` (one self-contained HTML file, esbuild only) and the page shell `source/template.html`
- the detail levels and the crash-safe level fallback (`quality.js`), the dynamic resolution and GPU timestamp timing
  (`main.js`), the scripted fly-through and benchmark idea (`dev.js`)
- the bloom chain, the tone map and the noise functions (`shaders.js`), the random numbers and mesh helpers (`math.js`)
- the structure of the procedural sound (`audio.js`)
- `prompt.txt`, Abyssal Garden's own brief, kept for reference: its verification method (a critic that sees only renders,
  a timed fly-through) is the one this spike follows

Everything about the canyon, the rock layers, the river, the trees, the haze, the eagle and its flight is new.

## Other third-party material

None. No textures, models, fonts or sound files: everything you see and hear is made by code at load time.
