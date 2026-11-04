---
version: alpha
name: Bitácora Implantes
description: Un cuaderno móvil para estudiar implantología y comprender cada respuesta.
colors:
  primary: "#103f4f"
  secondary: "#126e70"
  accent: "#9bd5cd"
  background: "#f3f7f7"
  surface: "#ffffff"
  text: "#163743"
  muted: "#52707a"
  border: "#ccdadd"
  success: "#176447"
  danger: "#a33331"
  warning: "#84531c"
  tint: "#e8f2f1"
  focus: "#176b9f"
typography:
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
  mono:
    fontFamily: "ui-monospace, monospace"
rounded:
  control: "8px"
  panel: "14px"
spacing:
  page-max: "480px"
  section-gap: "32px"
components:
  button:
    height: "48px"
  card:
    rounded: "panel"
  dialog:
    rounded: "panel"
---

# Bitácora Implantes

## Overview

Product register: a personal Spanish cybersecurity master's study app for a beginner, on phone and laptop. PRODUCT.md records current business intent. The explicit reference is the user's Bitácora PER app: same pocket-notebook layout, one question per screen, swipe navigation, a 480px maximum width, and browser-local progress. Preserve familiarity rather than adding cybersecurity neon or a desktop dashboard.

Signature: an open notebook with a small shield in the header, followed by subject rows and real topic numbers. Feedback occupies the same reading column as the question, with a quiet green/neutral result and a cited page. The visible source distinguishes a question confirmed in campus, a teaching-material test, and added practice.

Token model B: dist/styles.css :root remains the canonical runtime token owner. colors.x maps to --color-x; typography.body/display/mono to --font-body/display/mono; rounded.control/panel to --radius-control/panel; spacing.page-max/section-gap to --page-max/section-gap. Shared .btn, .answer-option, .topic-card and dialog consume those variables. tests/design.test.js verifies the mapping. Colors and fonts are inherited unchanged from the accepted PER UI.

## Colors

Deep blue primary #103f4f and teal secondary #126e70; quiet pale teal selection #e8f2f1; white #ffffff reading surfaces on #f3f7f7. Success #176447, danger #a33331 and warning #84531c always accompany explicit text. Light appearance with system forced-color support. No decorative gradients or cybersecurity neon.

## Typography

Locally hosted Manrope owns reading, questions, options and navigation. Barlow Condensed is available from the inherited font assets but is used sparingly. The headline is 26px, questions 17px with generous line height, text 14px. No external font request. Spanish accents retained; long text wraps without truncation.

## Layout

On phones, a single column of at most 480px, sticky 61px header, native document scrolling and fixed bottom navigation with safe-area padding. Hierarchy: subjects → topics → three blocks of ten or the full thirty-question test → one question. Natural-height explanation below the options. No horizontally scrolling subject grid. A quiet «Material del tema» section precedes the test list, with one primary open action, a secondary download action, page count and file size. Titles use «Tema n. Descripción» in numeric order, with the small row badge repeating only the number as a scanning aid. PDFs open separately; no inline PDF viewer or nested document scroller is added. Simulation hides bottom tabs and keeps answer navigation in a disclosure.

Desktop (from 1024px), user request of 3 November 2026: use the available width. The bottom tabs become a 220px left rail, content is centred up to 1040px, subject and topic lists use two columns, the topic page puts study material beside the tests, and practice shows the explanation beside the question. The digital topic uses up to 1400px: sticky section index, reading column limited to 72 characters, and each section's questions in a sticky side panel (index above the content between 1024 and 1279px).

Digital topic (tema digital): written from zero for a beginner, designed as an annotated study notebook. The one place Barlow Condensed speaks loudly: the topic title (38px phone, 64px desktop) and the section openers, where a large teal numeral marks the real reading sequence beside the section title. Reading text 15px/1.8 in a column of about 70 characters. Each block type has its own shape so it is recognisable at a glance: analogy «Imagínalo así» as a soft tinted note, term as a dictionary entry with a mint left rule and no box, example as a bordered case card, exam trap «Así cae en el test» as a warm amber callout, and «Idea clave» as a deep-blue panel that closes every section. Steps use connected numbered circles. Labels are sentence case, never uppercase. Intro shows «Antes de empezar» and «Al terminar sabrás» (✓ checklist) side by side on desktop. Questions are native details with a chevron: the question and options first, the argued answer in a nested disclosure so the reader can try before reading. On the topic page the digital topic card is the one dark (primary) card, as the main way to study.

## Elevation & Depth

One-pixel panel borders; only the modal casts a shadow. Feedback is a restrained tinted panel. The material panel uses the existing background, border and panel-radius tokens, with actions that wrap on narrow screens. Native select popup geometry is accepted for the simulation subject chooser; the app styles only its closed trigger.

## Shapes

14px panels, 8px controls, 5px answer markers. Header symbol is an SVG notebook and shield. No pill-shaped cards for every item.

## Components

.btn owns primary/secondary/text styles, hover, focus, active, disabled and busy behavior. Native radios/labels own answer selection. Native dialog.showModal owns modality, inert background, Escape and focus trapping; ask() supplies least-destructive initial focus and restoration. #notice role=status is the single storage-warning owner. explanation(q) is the shared feedback/source primitive used by practice and delivered-simulation review.

Global scrollbar tokens --scrollbar-thumb/track/hover/active apply to every owned scroll region using standard scrollbar properties and WebKit fallbacks, with a forced-colors fallback. No hidden scrollbars.

Inherited question motion uses 180ms exit and 240ms entrance; routes cancel animations, commits happen before motion, and controls remain inert during a transition. Reduced motion changes immediately. Buttons, swipes, number jumps and optional automatic advancement share navigation and preserve document scroll. No auto-advance by default, so feedback can be read.

## Do's and Don'ts

Keep imported questions/options in source order: references such as «A y B» must remain valid. Show explanations and source page when checking or reviewing; never while a simulation is active. Use the same labels across all subjects. Never present a training score as a campus grade or these simulations as an official exam. Browser-local saving is explicit; no cloud-sync claims. No user name, login or grade history from campus in this repository. The user-authorized topic PDFs are included as teaching material.
