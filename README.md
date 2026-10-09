# tic.tac.toe

A real-time multiplayer Tic-Tac-Toe web game built with Express, Socket.IO, and EJS. Enter your name, join the online lobby, and match up against active players for live head-to-head matches.

## Run locally

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000), set your display name, and click **Find me a match** to enter the queue.

The server listens on `PORT` 3000 by default. You can customize the port by setting `PORT` in a `.env` file or environment variable. Open the application in two separate browser windows or private sessions to test live matchmaking and play against yourself.

## How it works

The application uses WebSocket connections via Socket.IO to manage game rooms, state synchronization, and player presence. 

- **Matchmaking & Queue:** Players entering the queue are held in a waiting list and automatically paired into a match as soon as another player is available.
- **Game State Management:** Board state, turns, scores, and round wins are tracked and validated on the server to prevent invalid moves out of turn.
- **Audio & Visuals:** Sounds are synthesized on the client side using the Web Audio API with custom pitch frequencies for $X$ and $O$ moves.
- **Responsive Layout:** Designed with custom dark-mode CSS utilizing CSS Grid and Flexbox for mobile and desktop screens.