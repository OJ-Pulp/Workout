# Workout

A minimalist PWA for generating daily bodyweight and gym workouts.

## Features

- Generates a weekly schedule of 2 strength, 2 power, and 2 cardio days with no back-to-back repeats
- Season-aware exercise selection — bodyweight + outdoor cardio in spring/summer (April–October), equipment + indoor cardio in fall/winter (November–March)
- Tracks used exercises across the week to avoid repetition
- Core always includes at least one stabilizer alongside movers
- Conflict rules prevent incompatible exercises from appearing together
- Works offline via service worker

## Usage

Open [OJ-Pulp.github.io/Workout](https://OJ-Pulp.github.io/Workout) and tap **Generate workout**. Use **Shuffle new picks** to re-roll the day's exercises, or **Reset week** to start fresh.

## Structure

- `index.html` — markup
- `styles.css` — styles
- `app.js` — workout logic
- `exercises.json` — exercise pools, cardio options, and conflict rules
- `sw.js` — service worker for offline support
