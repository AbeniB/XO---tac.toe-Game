const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const app = express();
app.set("view engine", "ejs");
app.use("/static", express.static(__dirname + "/views/public"));
const server = createServer(app);
const io = new Server(server);

app.get("/", (req, res) => res.render("XO"));

const waitingPlayers = [];
const matches = new Map();
const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const playersOnline = () => io.emit("presence", { count: io.engine.clientsCount, waiting: waitingPlayers.map(p => ({ id: p.id, name: p.name })) });
const playerById = id => waitingPlayers.find(player => player.id === id);

function publicState(match) {
  return { board: match.board, turn: match.turn, scores: match.scores, round: match.round, status: match.status, winner: match.winner };
}
function sendState(match) {
  const state = publicState(match);
  match.players.forEach(player => player.socket.emit("game:state", state));
}
function startRound(match) {
  match.board = Array(9).fill("");
  match.turn = Math.random() < 0.5 ? "X" : "O";
  match.status = "playing";
  match.winner = "";
  match.round += 1;
  sendState(match);
}
function findWinner(board) {
  for (const line of wins) {
    if (board[line[0]] && line.every(index => board[index] === board[line[0]])) return board[line[0]];
  }
  return "";
}
function finishRound(match, winner) {
  match.status = "finished";
  match.winner = winner || "draw";
  if (winner) match.scores[winner] += 1;
  sendState(match);
}
function leaveMatch(socket, message) {
  const match = matches.get(socket.id);
  if (!match) return;
  matches.delete(match.players[0].id);
  matches.delete(match.players[1].id);
  const other = match.players.find(player => player.id !== socket.id);
  if (other) {
    other.socket.data.joined = true;
    other.socket.emit("match:ended", { message });
    waitingPlayers.push(other);
  }
}

io.on("connection", socket => {
  socket.data.player = { id: socket.id, name: "Player", socket };
  socket.emit("player:id", socket.id);
  playersOnline();

  socket.on("player:join", rawName => {
    if (socket.data.joined || matches.has(socket.id)) return;
    const name = String(rawName || "").trim().replace(/[<>]/g, "").slice(0, 18) || "Player";
    socket.data.player.name = name;
    socket.data.joined = true;
    const opponentIndex = waitingPlayers.findIndex(player => player.id !== socket.id);
    if (opponentIndex === -1) {
      waitingPlayers.push(socket.data.player);
      socket.emit("queue:waiting");
    } else {
      const [opponent] = waitingPlayers.splice(opponentIndex, 1);
      const players = [{ ...opponent, mark: "X" }, { ...socket.data.player, mark: "O" }];
      const match = { players, board: Array(9).fill(""), turn: Math.random() < 0.5 ? "X" : "O", scores: { X: 0, O: 0 }, round: 1, status: "playing", winner: "" };
      players.forEach(player => {
        matches.set(player.id, match);
        player.socket.emit("match:found", { opponent: players.find(other => other.id !== player.id).name, mark: player.mark });
      });
      sendState(match);
    }
    playersOnline();
  });

  socket.on("player:rename", rawName => {
    const name = String(rawName || "").trim().replace(/[<>]/g, "").slice(0, 18) || "Player";
    socket.data.player.name = name;
    const waiting = playerById(socket.id);
    if (waiting) waiting.name = name;
    const match = matches.get(socket.id);
    if (match) match.players.find(player => player.id === socket.id).name = name;
    playersOnline();
  });

  socket.on("match:leave", () => {
    const match = matches.get(socket.id);
    if (!match) return;
    const players = match.players;
    players.forEach(player => matches.delete(player.id));
    players.forEach(player => {
      player.socket.emit("match:ended", { message: `${socket.data.player.name} left the match.` });
      waitingPlayers.push(player);
    });
    playersOnline();
  });

  socket.on("game:move", index => {
    const match = matches.get(socket.id);
    const player = match?.players.find(item => item.id === socket.id);
    if (!match || match.status !== "playing" || !Number.isInteger(index) || index < 0 || index > 8 || match.turn !== player.mark || match.board[index]) return;
    match.board[index] = player.mark;
    const winner = findWinner(match.board);
    if (winner || match.board.every(Boolean)) finishRound(match, winner);
    else {
      match.turn = player.mark === "X" ? "O" : "X";
      sendState(match);
    }
  });

  socket.on("game:next", () => {
    const match = matches.get(socket.id);
    if (match?.status !== "finished") return;
    match.nextVotes ||= new Set();
    match.nextVotes.add(socket.id);
    if (match.nextVotes.size === 2) {
      match.nextVotes.clear();
      startRound(match);
    }
  });

  socket.on("disconnect", () => {
    const index = waitingPlayers.findIndex(player => player.id === socket.id);
    if (index !== -1) waitingPlayers.splice(index, 1);
    leaveMatch(socket, `${socket.data.player.name} left the match.`);
    playersOnline();
  });
});

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
