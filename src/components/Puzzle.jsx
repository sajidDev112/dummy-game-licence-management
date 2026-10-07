import { useCallback, useEffect, useRef, useState } from 'react'

const SIZES = [
  { value: 3, label: '3 × 3 — Easy' },
  { value: 4, label: '4 × 4 — Classic' },
  { value: 5, label: '5 × 5 — Hard' },
]

const BEST_KEY = 'opezee.puzzle.best'

const solvedBoard = (size) => [...Array(size * size - 1).keys()].map((n) => n + 1).concat(0)
const isSolved = (tiles) =>
  tiles.every((value, i) => (i === tiles.length - 1 ? value === 0 : value === i + 1))

/** Positions whose tile can slide into the gap. */
function movablePositions(tiles, size) {
  const blank = tiles.indexOf(0)
  const row = Math.floor(blank / size)
  const col = blank % size
  return [
    row > 0 ? blank - size : null,
    row < size - 1 ? blank + size : null,
    col > 0 ? blank - 1 : null,
    col < size - 1 ? blank + 1 : null,
  ].filter((p) => p !== null)
}

/**
 * Shuffles by walking the gap through random legal moves from the solved
 * board. Permuting the array directly would produce an unsolvable board about
 * half the time.
 */
function shuffle(size) {
  let tiles = solvedBoard(size)
  let blank = size * size - 1
  let previous = -1

  for (let i = 0; i < size * size * 40; i += 1) {
    const options = movablePositions(tiles, size).filter((p) => p !== previous)
    const pick = options[Math.floor(Math.random() * options.length)]
    previous = blank
    tiles = [...tiles]
    tiles[blank] = tiles[pick]
    tiles[pick] = 0
    blank = pick
  }

  // Landing back on solved would be a confusing start.
  return isSolved(tiles) ? shuffle(size) : tiles
}

const formatTime = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

function readBest(size) {
  try {
    return JSON.parse(localStorage.getItem(`${BEST_KEY}.${size}`) || 'null')
  } catch {
    return null
  }
}

export default function Puzzle() {
  const [size, setSize] = useState(4)
  const [tiles, setTiles] = useState(() => shuffle(4))
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const [best, setBest] = useState(() => readBest(4))

  const solved = isSolved(tiles)
  const movable = solved ? [] : movablePositions(tiles, size)
  const boardRef = useRef(null)

  // The clock only runs between the first move and the win.
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  const newGame = useCallback(
    (nextSize = size) => {
      setSize(nextSize)
      setTiles(shuffle(nextSize))
      setMoves(0)
      setSeconds(0)
      setRunning(false)
      setBest(readBest(nextSize))
    },
    [size]
  )

  // The state updater stays pure: React invokes updaters twice in StrictMode,
  // so incrementing the move count inside one would double every move.
  const move = useCallback(
    (position) => {
      if (isSolved(tiles) || !movablePositions(tiles, size).includes(position)) return

      const blank = tiles.indexOf(0)
      const next = [...tiles]
      next[blank] = next[position]
      next[position] = 0

      setTiles(next)
      setMoves((m) => m + 1)
      setRunning(true)
    },
    [tiles, size]
  )

  // Record the result once the board is solved.
  useEffect(() => {
    if (!solved || moves === 0) return
    setRunning(false)

    const result = { moves, time: formatTime(seconds) }
    const current = readBest(size)
    if (!current || moves < current.moves) {
      try {
        localStorage.setItem(`${BEST_KEY}.${size}`, JSON.stringify(result))
      } catch {
        /* best score is a nicety, not worth failing over */
      }
      setBest(result)
    }
  }, [solved, moves, seconds, size])

  // Arrow keys slide the tile from that direction into the gap.
  useEffect(() => {
    const onKey = (e) => {
      const offsets = { ArrowUp: size, ArrowDown: -size, ArrowLeft: 1, ArrowRight: -1 }
      if (!(e.key in offsets)) return
      e.preventDefault()

      const blank = tiles.indexOf(0)
      const target = blank + offsets[e.key]
      // Left/right must not wrap onto the neighbouring row.
      const sameRow = Math.floor(blank / size) === Math.floor(target / size)
      const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      if (horizontal && !sameRow) return
      if (target < 0 || target >= tiles.length) return

      move(target)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tiles, size, move])

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        {[
          ['Moves', moves],
          ['Time', formatTime(seconds)],
          ['Best', best ? `${best.moves} in ${best.time}` : '—'],
        ].map(([label, value]) => (
          <div key={label} className="min-w-[4.5rem]">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="text-lg font-semibold tabular-nums text-white">{value}</p>
          </div>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label="Puzzle size"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
            value={size}
            onChange={(e) => newGame(Number(e.target.value))}
          >
            {SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => newGame()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            New game
          </button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={boardRef}
          className="grid gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {tiles.map((value, i) =>
            value === 0 ? (
              <div key={`blank-${i}`} className="aspect-square rounded-lg bg-slate-950/60" />
            ) : (
              <button
                key={value}
                type="button"
                onClick={() => move(i)}
                disabled={!movable.includes(i)}
                className={`aspect-square rounded-lg text-xl font-bold tabular-nums transition ${
                  value === i + 1
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-slate-800 text-slate-100'
                } ${
                  movable.includes(i)
                    ? 'cursor-pointer hover:bg-indigo-500 hover:text-white'
                    : 'cursor-default opacity-90'
                }`}
              >
                {value}
              </button>
            )
          )}
        </div>

        {solved && moves > 0 && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/85">
            <div className="rounded-xl border border-slate-700 bg-slate-900 px-8 py-6 text-center">
              <h2 className="text-xl font-bold text-emerald-400">Solved</h2>
              <p className="mt-1 text-sm text-slate-400">
                {moves} moves in {formatTime(seconds)}
              </p>
              <button
                type="button"
                onClick={() => newGame()}
                className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Play again
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        Click a tile beside the gap, or use the arrow keys.
      </p>
    </div>
  )
}
