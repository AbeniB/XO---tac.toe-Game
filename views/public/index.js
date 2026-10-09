(() => {
  const socket = io();
  const $ = selector => document.querySelector(selector);
  const cells = [...document.querySelectorAll(".cell")];
  const dialog = $("#nameDialog");
  const nameInput = $("#nameInput");
  const waitingList = $("#waitingList");
  let name = "";
  let mark = "";
  let opponent = "";
  let gameState = null;
  let soundEnabled = false;
  let audioContext;

  function showNameDialog(edit = false) {
    nameInput.value = name;
    $("#joinButton").innerHTML = edit ? "Save name <span>→</span>" : "Find me a match <span>→</span>";
    $("#nameForm").dataset.edit = String(edit);
    if (!dialog.open) dialog.showModal();
    setTimeout(() => nameInput.focus(), 30);
  }
  function setStatus(message, active = false) {
    $("#statusText").textContent = message;
    $("#statusLine").classList.toggle("active", active);
  }
  function markText(value) { return value === "X" ? "X" : "O"; }
  function updateBoard(state) {
    gameState = state;
    const isMyTurn = state.status === "playing" && state.turn === mark;
    $("#board").classList.toggle("is-locked", !isMyTurn);
    const winningLine = state.winner && state.winner !== "draw" ? getWinningLine(state.board) : [];
    cells.forEach((cell, index) => {
      const value = state.board[index];
      cell.textContent = value;
      cell.classList.toggle("mark-o", value === "O");
      cell.classList.toggle("winning", winningLine.includes(index));
      cell.disabled = !isMyTurn || Boolean(value);
      cell.setAttribute("aria-label", value ? `${value} in square ${index + 1}` : `Empty square ${index + 1}`);
    });
    $("#scoreX").textContent = state.scores.X;
    $("#scoreO").textContent = state.scores.O;
    $("#roundNumber").textContent = String(state.round).padStart(2, "0");
    const mine = state.turn === mark;
    if (state.status === "playing") {
      $("#resultOverlay").hidden = true;
      $("#nextRound").disabled = false;
      $("#nextRound").innerHTML = "Play next round <span>→</span>";
      setStatus(mine ? "Your turn — make it count." : `${opponent} is thinking…`, mine);
    } else {
      const iWon = state.winner === mark;
      const draw = state.winner === "draw";
      const title = draw ? "A well-earned draw" : iWon ? "Lovely move. You win!" : `${opponent} takes this round`;
      $("#resultTitle").textContent = title;
      $("#resultText").textContent = draw ? "Neither player could find the winning line." : `${state.winner} completed three in a row.`;
      $("#resultIcon").textContent = draw ? "↔" : iWon ? "✦" : "◎";
      $("#nextRound").innerHTML = "Play next round <span>→</span>";
      $("#resultOverlay").hidden = false;
      setStatus(draw ? "Round complete · draw" : `${title} · round complete`);
    }
  }
  function getWinningLine(board) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    return lines.find(line => board[line[0]] && line.every(index => board[index] === board[line[0]])) || [];
  }
  function playTone(frequency = 550) {
    if (!soundEnabled) return;
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(.04, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .12);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + .12);
  }

  socket.on("player:id", id => { $("#playerId").textContent = `ID · ${id.slice(0, 7)}`; });
  socket.on("presence", data => {
    $("#onlineCount").textContent = `${data.count} player${data.count === 1 ? "" : "s"} online`;
    $("#waitingCount").textContent = data.waiting.length;
    waitingList.replaceChildren();
    if (!data.waiting.length) {
      const empty = document.createElement("p"); empty.className = "muted empty-players"; empty.textContent = "No one waiting just now. You could be first!"; waitingList.append(empty);
    } else data.waiting.forEach(player => {
      const row = document.createElement("div"); row.className = "waiting-player";
      const avatar = document.createElement("span"); avatar.className = "waiting-avatar"; avatar.textContent = player.name.charAt(0).toUpperCase();
      const label = document.createElement("span"); label.textContent = player.name;
      row.append(avatar, label); waitingList.append(row);
    });
  });
  socket.on("queue:waiting", () => { setStatus("Finding you a player…", true); cells.forEach(cell => cell.disabled = true); });
  socket.on("match:found", data => {
    opponent = data.opponent; mark = data.mark;
    $("#youLabel").textContent = name;
    $("#opponentLabel").textContent = opponent;
    $("#youChip .mark-badge").textContent = mark;
    $("#youChip .mark-badge").className = `mark-badge ${mark === "X" ? "x-badge" : "o-badge"}`;
    const otherMark = mark === "X" ? "O" : "X";
    $("#opponentChip .mark-badge").textContent = otherMark;
    $("#opponentChip .mark-badge").className = `mark-badge ${otherMark === "X" ? "x-badge" : "o-badge"}`;
    $("#leaveMatch").hidden = false;
    setStatus(`Matched with ${opponent}. Good luck!`, true);
  });
  socket.on("game:state", updateBoard);
  socket.on("match:ended", data => {
    mark = ""; gameState = null; $("#leaveMatch").hidden = true;
    $("#resultOverlay").hidden = true;
    cells.forEach(cell => { cell.textContent = ""; cell.disabled = true; cell.classList.remove("winning", "mark-o"); });
    $("#youLabel").textContent = name; $("#opponentLabel").textContent = "Waiting…";
    $("#scoreX").textContent = "0"; $("#scoreO").textContent = "0"; $("#roundNumber").textContent = "—";
    setStatus(`${data.message} Finding you another player…`, true);
  });
  socket.on("connect", () => { if (name) socket.emit("player:join", name); });
  socket.on("disconnect", () => setStatus("Connection lost. Reconnecting…", true));
  cells.forEach(cell => cell.addEventListener("click", () => {
    if (!gameState || gameState.status !== "playing" || gameState.turn !== mark || gameState.board[Number(cell.dataset.index)]) return;
    socket.emit("game:move", Number(cell.dataset.index)); playTone(mark === "X" ? 480 : 620);
  }));
  $("#nameForm").addEventListener("submit", event => {
    event.preventDefault();
    const nextName = nameInput.value.trim().replace(/[<>]/g, "").slice(0, 18);
    if (!nextName) { nameInput.focus(); return; }
    const editing = $("#nameForm").dataset.edit === "true";
    name = nextName; $("#playerName").textContent = name; $("#avatar").textContent = name.charAt(0).toUpperCase();
    dialog.close();
    if (editing) socket.emit("player:rename", name); else socket.emit("player:join", name);
  });
  $("#editName").addEventListener("click", () => showNameDialog(true));
  $("#nextRound").addEventListener("click", () => {
    if (!gameState || gameState.status !== "finished") return;
    $("#nextRound").disabled = true;
    $("#nextRound").textContent = "Waiting for opponent…";
    socket.emit("game:next");
    setTimeout(() => { if (gameState?.status === "finished") { $("#nextRound").disabled = false; $("#nextRound").innerHTML = "Play next round <span>→</span>"; } }, 6000);
  });
  $("#leaveMatch").addEventListener("click", () => socket.emit("match:leave"));
  $("#soundToggle").addEventListener("click", event => {
    soundEnabled = !soundEnabled;
    event.currentTarget.setAttribute("aria-pressed", String(soundEnabled));
    event.currentTarget.innerHTML = soundEnabled ? "♪ Sound on" : "♪ Sound off";
    document.body.classList.toggle("sound-on", soundEnabled);
    if (soundEnabled) playTone(700);
  });
  showNameDialog();
})();
