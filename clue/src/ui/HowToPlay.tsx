"use client";

import { BookOpen, DoorOpen, Footprints, Gavel, NotebookPen, Search } from "lucide-react";

const lessons = [
  { icon: Search, title: "Find the hidden truth", body: "One suspect, one weapon, and one room are sealed inside the Case File. Every other card belongs to a player." },
  { icon: Footprints, title: "Move through Vesper House", body: "Roll two dice, choose a highlighted legal destination, and follow the illuminated path. Entering a room ends movement." },
  { icon: DoorOpen, title: "Test a theory", body: "Inside a room, suggest a suspect and weapon. The room is supplied automatically; the named pieces are moved there." },
  { icon: BookOpen, title: "Watch who can answer", body: "Players respond clockwise. The first person who can disprove privately shows one matching card only to the suggester." },
  { icon: NotebookPen, title: "Record the evidence", body: "Mark impossibilities, ownership, suspicions, and custom notes. Failed answers are often as valuable as revealed cards." },
  { icon: Gavel, title: "Accuse only when certain", body: "A wrong accusation removes you from future turns, though you must still disprove. The Case File stays sealed until the end." },
];

export function HowToPlay() {
  return (
    <div className="rules-content">
      <div className="case-equation" aria-label="Suspect plus weapon plus room equals the sealed case file">
        <span><b>01</b> Suspect</span><i>+</i><span><b>02</b> Weapon</span><i>+</i><span><b>03</b> Room</span><i>=</i><strong><em>VA</em> Case File</strong>
      </div>
      <div className="lesson-grid">
        {lessons.map(({ icon: Icon, title, body }, index) => (
          <article key={title} className="lesson-card">
            <span className="lesson-index">0{index + 1}</span><Icon size={20} aria-hidden="true" />
            <h3>{title}</h3><p>{body}</p>
          </article>
        ))}
      </div>
      <div className="shortcut-strip"><strong>Keyboard</strong><span><kbd>N</kbd> Notebook</span><span><kbd>C</kbd> Cards</span><span><kbd>Space</kbd> Primary action</span><span><kbd>R</kbd> Reset camera</span><span><kbd>Esc</kbd> Close</span></div>
    </div>
  );
}

