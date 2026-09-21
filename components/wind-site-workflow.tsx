"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type WorkflowResult = {
  workflowId: string;
  calculationIds: Record<string, string>;
  plugin?: { id?: string; version?: string };
  standard?: { name?: string; edition?: string };
  stages?: Record<string, unknown>;
  result?: {
    wind_region_assessment?: {
      wind_region?: string;
      confidence?: string;
      distance_to_boundary_m?: number | null;
      warnings?: string[];
    };
    regional_wind_speed_assessment?: {
      regional_wind_speed_mps?: number;
      vr_mps?: number;
    };
    variables?: Array<{
      variable?: string;
      direction?: string | null;
      final_value?: number | null;
      recommended_value?: number | null;
      unit?: string;
    }>;
    design_wind_speeds?: Array<{
      face?: string;
      design_wind_speed_mps?: number;
      vdes_theta_mps?: number;
    }>;
    governing_vdes_mps?: number | null;
    governing_vsitb?: number | null;
    governing_direction?: string | null;
    warnings?: string[];
  };
};

type Stage = {
  key: string;
  label: string;
  description: string;
};

const stages: Stage[] = [
  {
    key: "site",
    label: "1 · Site",
    description: "Resolve the site, elevation and terrain profiles.",
  },
  {
    key: "wind_region",
    label: "2 · Wind region",
    description: "Determine region, VR, Mc and direction multipliers.",
  },
  {
    key: "terrain",
    label: "3 · Terrain",
    description: "Assess directional terrain evidence and Mz,cat.",
  },
  {
    key: "shielding",
    label: "4 · Shielding",
    description: "Assess surrounding obstructions and directional Ms.",
  },
  {
    key: "topography",
    label: "5 · Topography",
    description: "Assess terrain features and directional Mt.",
  },
  {
    key: "design",
    label: "6 · Design wind speed",
    description: "Assemble Vsit,b and building-orthogonal Vdes,θ.",
  },
];

function variableRange(result: WorkflowResult | null, variable: string) {
  const values = (result?.result?.variables ?? [])
    .filter((row) => row.variable === variable)
    .map((row) => row.final_value ?? row.recommended_value)
    .filter((value): value is number => typeof value === "number");

  if (!values.length) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return minimum === maximum ? minimum.toFixed(3) : `${minimum.toFixed(3)}–${maximum.toFixed(3)}`;
}

export function WindSiteWorkflow({
  projectId,
  projectNumber,
  defaultAddress,
}: {
  projectId: string;
  projectNumber: string | null;
  defaultAddress: string | null;
}) {
  const router = useRouter();
  const [address, setAddress] = useState(defaultAddress ?? "");
  const [buildingHeight, setBuildingHeight] = useState("10");
  const [averageRoofHeight, setAverageRoofHeight] = useState("8");
  const [aep, setAep] = useState("1/500");
  const [structureClass, setStructureClass] = useState("building");
  const [orientation, setOrientation] = useState("0");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [roofShape, setRoofShape] = useState("");
  const [roofPitch, setRoofPitch] = useState("");
  const [analysisRadius, setAnalysisRadius] = useState("2000");
  const [obstructionRadius, setObstructionRadius] = useState("500");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [workflow, setWorkflow] = useState<WorkflowResult | null>(null);

  const completedKeys = useMemo(
    () => new Set(Object.keys(workflow?.calculationIds ?? {})),
    [workflow],
  );

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setWorkflow(null);

    const overallHeight = Number(buildingHeight);
    const averageHeight = Number(averageRoofHeight);

    if (!Number.isFinite(overallHeight) || overallHeight <= 0) {
      setBusy(false);
      setMessage("Overall building height must be greater than zero.");
      return;
    }

    if (!Number.isFinite(averageHeight) || averageHeight <= 0 || averageHeight > overallHeight) {
      setBusy(false);
      setMessage("Average roof height must be greater than zero and not exceed overall height.");
      return;
    }

    if ((width && !length) || (!width && length)) {
      setBusy(false);
      setMessage("Provide both building width and length, or leave both blank.");
      return;
    }

    const inputs: Record<string, unknown> = {
      address: address.trim(),
      building_height_m: overallHeight,
      average_roof_height_m: averageHeight,
      radius_m: Number(analysisRadius),
      sample_interval_m: 50,
      mzcat_recommendation_mode: "conservative",
      obstruction_radius_m: Number(obstructionRadius),
      default_storey_height_m: 3,
      residential_storey_height_m: 3,
      residential_two_storey_height_m: 6,
      commercial_storey_height_m: 4,
      manual_overrides: [],
      reviewed_footprints: [],
      map_display_mode: "nearest_500",
      map_max_display_obstructions: 500,
      annual_exceedance_probability: aep,
      structure_class: structureClass,
      wind_direction_multiplier_case: "main_structure",
      structure_orientation_deg: Number(orientation),
      assessment_status: "draft",
      mixed_terrain_profiles: [],
      class_multiplier_overrides: [],
      workflow_overrides: [],
    };

    if (projectNumber) inputs.project_number = projectNumber;
    if (width && length) {
      inputs.building_width_m = Number(width);
      inputs.building_length_m = Number(length);
    }
    if (roofShape) inputs.roof_shape = roofShape;
    if (roofPitch) inputs.roof_pitch_deg = Number(roofPitch);

    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke(
      "opencalcs-run-wind-workflow",
      {
        body: {
          projectId,
          inputs,
        },
      },
    );

    setBusy(false);

    if (error || data?.error) {
      setMessage(error?.message || data?.error || "Wind assessment failed.");
      return;
    }

    setWorkflow(data as WorkflowResult);
    setMessage("Wind assessment completed and linked calculation graph saved.");
    router.refresh();
  }

  const region = workflow?.result?.wind_region_assessment?.wind_region;
  const mzcatRange = variableRange(workflow, "Mzcat");
  const msRange = variableRange(workflow, "Ms");
  const mtRange = variableRange(workflow, "Mt");
  const governingVdes = workflow?.result?.governing_vdes_mps;

  return (
    <section className="wind-workflow-card" id="add-calculation">
      <div className="wind-workflow-heading">
        <div>
          <p className="eyebrow">OpenWind · AS/NZS 1170.2:2021</p>
          <h2>Site wind assessment</h2>
          <p>
            Start with the site and building. OpenCalcs runs the evidence workflow once,
            then stores each engineering stage as a linked calculation.
          </p>
        </div>
        <span className="workflow-badge">6 linked stages</span>
      </div>

      <div className="wind-stage-strip" aria-label="Wind assessment stages">
        {stages.map((stage) => (
          <div
            className={
              completedKeys.has(stage.key)
                ? "wind-stage complete"
                : busy
                  ? "wind-stage running"
                  : "wind-stage"
            }
            key={stage.key}
          >
            <span>{completedKeys.has(stage.key) ? "✓" : stage.label.split(" · ")[0]}</span>
            <div>
              <strong>{stage.label.split(" · ")[1]}</strong>
              <small>{stage.description}</small>
            </div>
          </div>
        ))}
      </div>

      <form className="wind-workflow-form" onSubmit={run}>
        <fieldset>
          <legend>Site</legend>
          <div className="input-grid">
            <label className="input-span-2">
              Site address
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="88 Marsden Street, Parramatta NSW"
                maxLength={300}
                required
              />
            </label>
            <label>
              Overall building height
              <div className="input-with-unit">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="200"
                  value={buildingHeight}
                  onChange={(event) => setBuildingHeight(event.target.value)}
                  required
                />
                <span>m</span>
              </div>
            </label>
            <label>
              Average roof height
              <div className="input-with-unit">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="200"
                  value={averageRoofHeight}
                  onChange={(event) => setAverageRoofHeight(event.target.value)}
                  required
                />
                <span>m</span>
              </div>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Design basis</legend>
          <div className="input-grid">
            <label>
              Annual exceedance probability
              <select value={aep} onChange={(event) => setAep(event.target.value)}>
                <option value="1/100">1/100</option>
                <option value="1/200">1/200</option>
                <option value="1/500">1/500</option>
                <option value="1/1000">1/1000</option>
                <option value="1/2000">1/2000</option>
              </select>
            </label>
            <label>
              Structure class
              <select
                value={structureClass}
                onChange={(event) => setStructureClass(event.target.value)}
              >
                <option value="building">Building</option>
                <option value="house">House</option>
                <option value="monopole">Monopole</option>
                <option value="tower">Tower</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Building orientation β
              <div className="input-with-unit">
                <input
                  type="number"
                  min="0"
                  max="359.999"
                  step="0.1"
                  value={orientation}
                  onChange={(event) => setOrientation(event.target.value)}
                />
                <span>°</span>
              </div>
            </label>
            <label>
              Analysis radius
              <select
                value={analysisRadius}
                onChange={(event) => setAnalysisRadius(event.target.value)}
              >
                <option value="500">500 m</option>
                <option value="1000">1,000 m</option>
                <option value="2000">2,000 m</option>
                <option value="4000">4,000 m</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Building geometry <span>optional</span></legend>
          <div className="input-grid">
            <label>
              Width
              <div className="input-with-unit">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={width}
                  onChange={(event) => setWidth(event.target.value)}
                />
                <span>m</span>
              </div>
            </label>
            <label>
              Length
              <div className="input-with-unit">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={length}
                  onChange={(event) => setLength(event.target.value)}
                />
                <span>m</span>
              </div>
            </label>
            <label>
              Roof shape
              <select value={roofShape} onChange={(event) => setRoofShape(event.target.value)}>
                <option value="">Not specified</option>
                <option value="gable">Gable</option>
                <option value="hip">Hip</option>
                <option value="monoslope">Monoslope</option>
              </select>
            </label>
            <label>
              Roof pitch
              <div className="input-with-unit">
                <input
                  type="number"
                  min="0"
                  max="90"
                  step="0.1"
                  value={roofPitch}
                  onChange={(event) => setRoofPitch(event.target.value)}
                />
                <span>°</span>
              </div>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Evidence collection</legend>
          <div className="input-grid">
            <label>
              Obstruction radius
              <select
                value={obstructionRadius}
                onChange={(event) => setObstructionRadius(event.target.value)}
              >
                <option value="250">250 m</option>
                <option value="500">500 m</option>
                <option value="1000">1,000 m</option>
                <option value="2000">2,000 m</option>
                <option value="4000">4,000 m</option>
              </select>
            </label>
            <div className="workflow-note">
              <strong>Engineer review remains required.</strong>
              <span>
                Terrain, shielding, topography, wind-region boundaries and jurisdictional
                variations remain reviewable evidence.
              </span>
            </div>
          </div>
        </fieldset>

        <div className="wind-run-row">
          <div>
            {message ? <p className="form-message">{message}</p> : null}
          </div>
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? "Running site assessment…" : "Run site wind assessment"}
          </button>
        </div>
      </form>

      {workflow ? (
        <div className="wind-results">
          <div className="wind-results-heading">
            <div>
              <p className="eyebrow">Saved calculation graph</p>
              <h3>Assessment result</h3>
            </div>
            <span>
              {workflow.plugin?.id} {workflow.plugin?.version}
            </span>
          </div>

          <div className="wind-result-grid">
            <article>
              <small>Wind region</small>
              <strong>{region || "Review required"}</strong>
              <span>{workflow.result?.wind_region_assessment?.confidence || "—"} confidence</span>
            </article>
            <article>
              <small>Mz,cat</small>
              <strong>{mzcatRange || "Review required"}</strong>
              <span>directional range</span>
            </article>
            <article>
              <small>Shielding Ms</small>
              <strong>{msRange || "Review required"}</strong>
              <span>directional range</span>
            </article>
            <article>
              <small>Topography Mt</small>
              <strong>{mtRange || "Review required"}</strong>
              <span>directional range</span>
            </article>
            <article className="governing-result">
              <small>Governing Vdes,θ</small>
              <strong>
                {typeof governingVdes === "number" ? governingVdes.toFixed(1) : "—"}
                <em> m/s</em>
              </strong>
              <span>
                {workflow.result?.governing_direction
                  ? `governing direction ${workflow.result.governing_direction}`
                  : "building-orthogonal design speed"}
              </span>
            </article>
          </div>
        </div>
      ) : null}
    </section>
  );
}
