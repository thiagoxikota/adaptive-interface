# Build Day submission: form answers, question by question

Form: https://form.typeform.com/to/SygLMeAD ("Build Day Project Submissions", 18 questions, about 7 minutes). Paste each block as is. Every number below comes from `tests/out/*/summary.json` or `_review/`. Physical vocabulary only.

The repository is public; `docs/demo-debug.mp4` (2.1 MB) is the file uploaded in question 13. Solo project.

## 1. About you

First name: Thiago
Last name: Xikota
Email: thiagoxikota@gmail.com

## 2. Which Build Day did you attend? (City, State/Province, Country)

São Paulo, SP, Brazil (Claude Code Build Day, September 18, 2026)

## 3. Project name

Adaptive Interface

## 4. What would you like to share today?

A full project write-up (description, links, more photos)

## 5. Social media handle(s)

LinkedIn: linkedin.com/in/thiagoxikota
Instagram: @thiagoxikota
GitHub: github.com/thiagoxikota
Site: thiagoxikota.com

## 6. What is your project? (required)

Adaptive Interface is an operations dashboard that physically restructures in response to how you interact with it. A webcam and MediaPipe Face Landmarker read a few observable signals, all on your machine: whether a face is present, how close it is compared to a calibrated baseline, brow activity, smile activity and head angle. The pointer adds where it rests and for how long. A small local state machine turns those signals into four layouts.

Lean in and furrow your brow, and within about a second the secondary navigation collapses, cards disappear, the primary action moves to the center and the chart turns into two sentences. Smile, and the same page compresses into an expert view with eight metrics, denser controls and keyboard shortcuts. Lean in while the pointer rests on a card, and that card takes the stage. Lean back, and everything returns.

It is for anyone who has watched someone squint at a dashboard. Interfaces have one density for everyone, all the time; this one has four and picks by watching. Nothing here infers emotion. The thresholds sit in a debug panel one key away, every transition needs a sustained gesture, and there is always a way back: one key or one button.

## 7. How did Claude contribute? (required)

Two ways. In the product, Claude Opus 5 writes one line of contextual copy after a mode has already changed, through a small server middleware that keeps the API key off the browser. The layout never waits for it; if the request fails, the static copy stays.

In the process, Claude Code with Claude Fable 5.1 built the whole thing in one evening. Four parallel subagents worked on disjoint modules against a shared type contract. A Playwright harness fed clips of my own face to Chromium as a fake camera, so the real MediaPipe pipeline could be measured headless. Then came adversarial review rounds: Codex on the diff, and five Claude review lenses with a skeptic per finding. The 48 accepted findings are logged in the repo.

The interface reacting to a real smile was measured before I ever sat in front of it: the smile signal peaked at 0.90 and the mode switched 930 ms after it crossed the threshold.

## 8. What's your biggest takeaway from today? (may be quoted)

The camera was reading my smile perfectly and the interface still did nothing. The bug was not in the vision model. It was a six-second keyboard lock added as a safety net. The model reads the face; the product is the state machine around it, and that is where the design lives.

Alternative, shorter:

Physical signals are enough. Nobody needs an interface to guess how they feel. They need it to notice that they leaned in.

## 9. What would you tell someone who's never tried this? (may be quoted)

Write the contract before the code: the types the modules share, the thresholds, the keys. Then let the agents build in parallel while you spend your own time on the part no agent can do, which is deciding what the thing should feel like. And test against something real. I fed the harness a video of my own face before the camera ever opened.

## 10. Anything else you want to tell us about your project?

Built at the Claude Code Build Day in São Paulo on September 18, 2026. The dashboard data is fictional; the face in the demo video is mine. I run The AI Collective in Florianópolis, where a lot of our conversations are about what makes an AI interface trustworthy, and this is the smallest demo I could think of for one idea: an interface can respond to how you interact without claiming to know how you feel.

Third-party assets, all used per their licenses: MediaPipe Face Landmarker model and wasm (Google, Apache 2.0), React, Vite, framer-motion and the Anthropic SDK (MIT). Solo project; the only face and voice in the materials are mine.

## 11. Link to your project (required)

https://github.com/thiagoxikota/adaptive-interface

## 12. What are you sharing? (check all that apply)

- A photo of my finished build (the mode screenshots in docs/)
- A video of it in action (or a screen recording)
- Close-up / detail shots (wiring, labels, sketches, UI)

## 13. Screenshots / videos of your project (one file, 10 MB limit)

Upload `docs/demo-debug.mp4` (2.1 MB): the interface reacting to the face, with the camera preview, the live signals and the transition reason on screen.

## 14. Links to additional media about your project

Clean demo video: https://github.com/thiagoxikota/adaptive-interface/blob/main/docs/demo.mp4
Demo GIF: https://github.com/thiagoxikota/adaptive-interface/blob/main/docs/demo.gif
Same run with the debug panel (face and signals visible): https://github.com/thiagoxikota/adaptive-interface/blob/main/docs/demo-debug.mp4
Screenshots of the four modes: https://github.com/thiagoxikota/adaptive-interface/tree/main/docs
Architecture note: https://github.com/thiagoxikota/adaptive-interface/blob/main/docs/ARCHITECTURE.md

## 15. Preferred attribution (required)

Thiago Xikota, linkedin.com/in/thiagoxikota, @thiagoxikota, thiagoxikota.com

## 16 to 18. Consents (required, yours to give)

Consent to be contacted, consent to feature (non-exclusive, royalty-free, worldwide, perpetual, irrevocable license), IP attestation. Read https://support.claude.com/en/articles/15485501-submit-your-build-how-it-works-and-what-you-re-agreeing-to first. Everything in the repo is original work under MIT; the vendored MediaPipe files are Apache 2.0 from Google; the face in the clips is the author's.

## Suggested social caption (2 lines)

A dashboard that restructures itself from your face and pointer, with every decision made locally in the browser and Claude writing one line of copy after the layout has already moved.
Built in one evening with Claude Code for Build Day, verified headless with a fake camera and clips of a real face.

