# Slop Guess

A multiplayer AI image guessing game. Players compete to guess the prompt used to generate AI images.

## Project Structure

```
slop-guess/
  client/       # React frontend (Vite + TypeScript)
  server/       # Express backend (Node + TypeScript)
```

## Prerequisites

- Node.js 18+
- PostgreSQL

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your values
3. Install dependencies:
   ```bash
   npm run install:all
   ```
4. Start development servers:
   ```bash
   npm run dev:server
   npm run dev:client
   ```

## Environment Variables

See `.env.example` for required configuration.
