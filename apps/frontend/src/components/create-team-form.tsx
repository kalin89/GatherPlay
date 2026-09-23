"use client";

import { useState, type FormEvent } from "react";
import { TEAM_COLORS } from "@/lib/team-colors";
import styles from "./create-team-form.module.css";

export function CreateTeamForm({
  onCreate,
}: {
  onCreate: (name: string, color: string) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(TEAM_COLORS[0]);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onCreate(trimmedName, color);
    setName("");
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <input
        type="text"
        className={styles.input}
        placeholder="Nombre del equipo"
        value={name}
        maxLength={20}
        onChange={(event) => setName(event.target.value)}
      />
      <div className={styles.swatches} role="group" aria-label="Color del equipo">
        {TEAM_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={styles.swatch}
            style={{ background: swatch }}
            aria-label={`Elegir color ${swatch}`}
            aria-pressed={swatch === color}
            data-selected={swatch === color}
            onClick={() => setColor(swatch)}
          />
        ))}
      </div>
      <button type="submit" className={styles.submit} disabled={!canSubmit}>
        Agregar equipo
      </button>
    </form>
  );
}
