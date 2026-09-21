"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CalculationDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  standard?: {
    name?: string;
    edition?: string;
  } | null;
  input_schema?: {
    required?: string[];
    properties?: Record<
      string,
      {
        type?: string;
        minimum?: number;
        exclusiveMinimum?: number;
        maximum?: number;
        exclusiveMaximum?: number;
        default?: boolean | number | string;
        unit?: string;
      }
    >;
  };
};

function labelFor(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function CalculationLauncher({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const [definitions, setDefinitions] = useState<CalculationDefinition[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/calculations", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error || "Unable to load calculation library.");
        }
        return response.json();
      })
      .then((items: CalculationDefinition[]) => {
        const wind = items.filter((item) => item.id.startsWith("au.wind."));
        setDefinitions(wind);
        if (wind[0]) {
          setSelectedId(wind[0].id);
          setTitle(wind[0].name);
        }
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(
    () => definitions.find((item) => item.id === selectedId),
    [definitions, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    const nextValues: Record<string, string | boolean> = {};
    for (const [key, schema] of Object.entries(selected.input_schema?.properties || {})) {
      if (schema.type === "boolean") {
        nextValues[key] = typeof schema.default === "boolean" ? schema.default : true;
      } else if (schema.default !== undefined) {
        nextValues[key] = String(schema.default);
      } else {
        nextValues[key] = "";
      }
    }
    setValues(nextValues);
    setTitle(selected.name);
    setMessage("");
  }, [selected]);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;

    const inputs: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(selected.input_schema?.properties || {})) {
      const value = values[key];
      if (schema.type === "boolean") {
        inputs[key] = Boolean(value);
      } else if (schema.type === "integer") {
        inputs[key] = Number.parseInt(String(value), 10);
      } else if (schema.type === "number") {
        inputs[key] = Number(String(value));
      } else if (schema.type === "object") {
        try {
          inputs[key] = JSON.parse(String(value));
        } catch {
          setMessage(`${labelFor(key)} must be valid JSON.`);
          return;
        }
      } else {
        inputs[key] = String(value);
      }
    }

    setBusy(true);
    setMessage("");

    const response = await fetch(
      `/api/calculations/${encodeURIComponent(selected.id)}/run`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title,
          inputs,
        }),
      },
    );

    const payload = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(payload.error || "Calculation failed.");
      return;
    }

    setMessage("Calculation run saved.");
    router.refresh();
  }

  if (loading) {
    return <div className="calculator-launcher">Loading calculation library…</div>;
  }

  return (
    <section className="calculator-launcher">
      <div className="launcher-heading">
        <div>
          <p className="eyebrow">Add calculation</p>
          <h2>Wind calculations</h2>
          <p>Run OpenWind through the OpenCalcs runtime and save the result to this project.</p>
        </div>
      </div>

      {!definitions.length ? (
        <p className="form-message">{message || "No OpenWind calculations are available."}</p>
      ) : (
        <form className="calculator-form" onSubmit={run}>
          <label>
            Calculation
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {definitions.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.name}
                </option>
              ))}
            </select>
          </label>

          {selected ? (
            <div className="definition-note">
              <strong>{selected.standard?.name || "OpenWind"}</strong>
              <span>
                {selected.standard?.edition ? ` · ${selected.standard.edition}` : ""}
              </span>
              <p>{selected.description}</p>
            </div>
          ) : null}

          <label>
            Calculation title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
            />
          </label>

          <div className="input-grid">
            {Object.entries(selected?.input_schema?.properties || {}).map(([key, schema]) => {
              if (schema.type === "boolean") {
                return (
                  <label className="checkbox-field" key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(values[key])}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [key]: event.target.checked }))
                      }
                    />
                    {labelFor(key)}
                  </label>
                );
              }

              if (schema.type === "object") {
                return (
                  <label className="input-span-2" key={key}>
                    {labelFor(key)}
                    <textarea
                      rows={7}
                      value={String(values[key] ?? "")}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [key]: event.target.value }))
                      }
                      placeholder='{"N": 40, "NE": 40, "E": 40, "SE": 40, "S": 40, "SW": 40, "W": 40, "NW": 40}'
                      required={selected?.input_schema?.required?.includes(key)}
                    />
                  </label>
                );
              }

              return (
                <label key={key}>
                  {labelFor(key)}
                  <input
                    type={
                      schema.type === "number" || schema.type === "integer" ? "number" : "text"
                    }
                    step={schema.type === "integer" ? "1" : schema.type === "number" ? "any" : undefined}
                    min={schema.minimum ?? schema.exclusiveMinimum}
                    max={schema.maximum ?? schema.exclusiveMaximum}
                    value={String(values[key] ?? "")}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [key]: event.target.value }))
                    }
                    required={selected?.input_schema?.required?.includes(key)}
                  />
                </label>
              );
            })}
          </div>

          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? "Running…" : "Run & save"}
            </button>
          </div>

          {message ? <p className="form-message">{message}</p> : null}
        </form>
      )}
    </section>
  );
}
