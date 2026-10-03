# Self-hosting text-to-image on Railway Hobby (GitHub #14, child of #11)

Date: 2026-10-03. Sources are primary docs/READMEs; items marked **[extrapolation]** are my inference, not published numbers.

## Verdict

**Technically feasible on CPU, but a poor fit; not worth pursuing as a FLUX replacement.** Railway has no GPU, so it is CPU-only. An always-on container sized for SD-Turbo costs ~$70-120/mo against a $5 credit. Serverless (sleep) fits the credit, but each image takes roughly 5-30 s **[extrapolation]** and 5 concurrent jobs queue on a few vCPUs. Quality is also lower than FLUX schnell. Only consider it as a free-credit fallback for the quota-exceeded case.

## 1. GPU or CPU-only
- Railway's pricing docs list only CPU, RAM, egress and volumes. They mention no GPU on any plan: https://docs.railway.com/reference/pricing/plans
- A Railway Station feedback thread has users asking for GPU support: https://station.railway.com/feedback/gpu-support-56d19c42 (community thread, not an official statement). I found no official "no GPU" sentence, so treat "CPU-only" as strongly indicated rather than documented.

## 2. Limits and cost
- Hobby is $5/mo and includes $5 of usage. Per-service limits as published: 48 vCPU, 48 GB RAM, 100 GB ephemeral storage, 5 GB volume. Usage pricing: RAM $10/GB/mo ($0.000231/GB/min), CPU $20/vCPU/mo ($0.000463/vCPU/min), egress $0.05/GB, volume $0.15/GB/mo: https://docs.railway.com/reference/pricing/plans
- The $5 credit is consumed by usage and anything above it is billed: https://docs.railway.com/reference/pricing/faqs
- Caveat: the 48 vCPU / 48 GB Hobby figure looks high versus my recollection of earlier caps; verify in the dashboard. A 4 vCPU / 4 GB service is inside either number.
- Sizing assumption: 4 vCPU + 4 GB (SD-Turbo ~0.9B params per https://huggingface.co/stabilityai/sd-turbo). Computed from the prices above:
  - **Always-on:** 4x$20 + 4x$10 = **$120/mo**. 2 vCPU / 3 GB is $70/mo; 1 vCPU / 2 GB is $40/mo. All far over the $5 credit.
  - **Per active minute (4 vCPU / 4 GB):** 4x0.000463 + 4x0.000231 = $0.00278/min, so $5 buys ~1,800 active minutes (~30 h/mo), shared with anything else on the account.
  - **On-demand at the app's volume:** 170 images/day x ~10 s ~ 28 min/day ~ 14 h/mo ~ $2.4/mo, plus wake/idle tails. 5-20 images/day is cents. **[extrapolation on per-image time]**
- Serverless sleep: a service sleeps after ~5-10 min with no outbound traffic and wakes on inbound requests. The first request may be slow or return a 502 (cold boot). It applies only to newly deployed containers: https://docs.railway.com/reference/app-sleeping
  - While awake it bills full CPU/RAM, so each wake costs a ~5-10 min idle tail, about $0.014-0.028 at 4 vCPU / 4 GB. A few wakes a day is ~$1-2/mo.

## 3. Models that fit CPU-only
FastSD CPU (https://github.com/rupeshs/fastsdcpu) states minimum RAM by mode: LCM 2 GB, LCM-LoRA 4 GB, OpenVINO 11 GB (9 GB with tiny decoder).
- **SD-Turbo** (512x512, 1-4 steps, 0.9B params): https://huggingface.co/stabilityai/sd-turbo. The card sends commercial use to Stability's membership terms, so check licensing before any monetization (ADR 0002).
- **SDXL-Turbo, SDXS-512, Hyper-SD/SDXL-Lightning** appear in FastSD's benchmark list. SDXL variants need far more RAM than a 4 GB box.
- **SD 1.5 LCM / LCM-LoRA** run in 2-4 GB (FastSD table above).
- **stable-diffusion.cpp** supports SD 1.x/2.x, SDXL, FLUX and others, GGUF/quantized weights, AVX/AVX2/AVX512 CPU backends and VAE tiling: https://github.com/leejet/stable-diffusion.cpp. Its README gives no benchmarks or memory tables, so I have no cited numbers for it.
- I did not verify BK-SDM, SnapFusion or OnnxStream; no primary benchmarks found in this pass.

## 4. Latency
The only published numbers I found are FastSD CPU's, on an **Intel Core i7-12700** (desktop, high clocks), 512x512, 1 step (https://github.com/rupeshs/fastsdcpu):

| Model | Pipeline | Latency |
|---|---|---|
| SDXS-512-0.9 | OpenVINO + TAESD | 0.82 s |
| SD Turbo | OpenVINO + TAESD | 1.7 s |
| SD Turbo | OpenVINO (no TAESD) | 5 s |
| SD Turbo | PyTorch | 7.8 s |
| SDXL Turbo | OpenVINO + TAESD | 2.5 s |

The 5 s and 7.8 s rows reached me via a search summary of the same README and were not re-verified on the page. TAESD (tiny VAE) trades some quality for speed.

**[extrapolation]** Railway vCPUs are shared cloud threads, likely slower per thread than a desktop i7, and no benchmark exists for them. Assume 2-4x slower on 4 vCPU: roughly **4-7 s** (OpenVINO+TAESD, 1 step) to **15-30 s** (PyTorch, 1 step). More steps scale roughly linearly. Add model-load time on cold start (several seconds to tens of seconds). OpenVINO's 9-11 GB RAM need would raise an always-on box to ~$150+/mo. 1-step SD-Turbo quality is well below FLUX schnell, which matters because image fidelity is a rubric axis.

## 5. Fit with the app's design
- "Never block the card on the image" holds: cards render with a placeholder and `GET /img/<key>` is already lazy. A 10-60 s image is a degraded experience, not a violation. But 5 concurrent jobs on ~4 vCPUs serialize, so image 5 of a batch could land after 1-2 min **[extrapolation]**.
- Integration: the Worker's R2-miss path would call the Railway service over HTTPS, store the JPEG in R2 and return it (Worker proxies; the client must not call Railway directly, since that bypasses the shared secret and rate limit). It needs a second secret. Fetch wait time does not count as Worker CPU time, but very long subrequests may hit timeouts, so a fire-and-poll design may be needed.
- Cold start: the first image after sleep pays wake plus model load, and Railway documents possible 502s on first request, so the Worker needs retry. The client already tolerates a 404/placeholder.
- The `dishKey` cache (ADR 0002) reduces calls over time, helping the credit but not miss latency.
- Existing FLUX quota is ~170 images/day (CLAUDE.md), which already covers the single-user case. A CPU fallback only helps if that quota is exceeded.

## Recommendation
**Not worth pursuing as a primary path; at most a niche fallback.** Key numbers: no GPU; always-on 4 vCPU/4 GB = $120/mo; serverless fits the $5 credit (~30 h/mo active, ~$2/mo at 170 images/day); ~5-30 s/image at 1 step **[extrapolated]**; RAM 2-4 GB (LCM/SD-Turbo) up to 11 GB (OpenVINO); lower fidelity than FLUX. If anyone prototypes it, first benchmark SD-Turbo via stable-diffusion.cpp or FastSD CPU on a real Railway service, since the latency here is extrapolated.
