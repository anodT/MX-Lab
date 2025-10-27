import { useState } from "react";
import "./index.css";

export default function App() {
  const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5001";

  // -------- student flow --------
  const [view, setView] = useState("login");
  const [form, setForm] = useState({ fullName: "", id950: "", period: "", password: "" });
  const [token, setToken] = useState("");
  const [metal, setMetal] = useState("");
  const [trials, setTrials] = useState({});
  const [opened, setOpened] = useState({});
  const [selectedTrial, setSelectedTrial] = useState(null);
  const [guess, setGuess] = useState("");

  // -------- teacher tools --------
  const [showTeacher, setShowTeacher] = useState(false);
  const [teacherAuthed, setTeacherAuthed] = useState(false);
  const [teacherPwd, setTeacherPwd] = useState("");
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  // -------- about modal --------
  const [showAbout, setShowAbout] = useState(false);

  // ---------- student handlers ----------
  async function handleLogin(e) {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!data.ok) return alert(data.error || "Login failed");
    setToken(data.token);
    setMetal(data.metal);
    setTrials(data.trials);
    setView("trials");
  }

  async function handleSubmitGuess() {
    if (!guess) return alert("Enter your predicted metal first!");
    const res = await fetch(`${API_BASE}/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, guess }),
    });
    const data = await res.json();
    if (!data.ok) return alert(data.error || "Submit failed");
    alert(`Your answer is ${data.result}. Returning to login.`);
    window.location.reload();
  }

  // ---------- teacher handlers ----------
  async function teacherLogin() {
    if (!teacherPwd) return alert("Enter the teacher password.");
    const res = await fetch(`${API_BASE}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: teacherPwd }),
    });
    if (res.ok) setTeacherAuthed(true);
    else alert("Wrong password.");
  }

  async function downloadResultsCSV() {
    if (!teacherAuthed) return alert("Unlock teacher tools first.");
    const url = `${API_BASE}/api/results?password=${encodeURIComponent(teacherPwd)}`;
    const res = await fetch(url);
    if (!res.ok) return alert("Download failed (check password / server).");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "results.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function resetAllData() {
    if (!teacherAuthed) return alert("Unlock teacher tools first.");
    const res = await fetch(`${API_BASE}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: teacherPwd, confirm: true }),
    });
    if (res.ok) {
      alert("Results cleared and 950s reset.");
      setShowConfirmReset(false);
    } else {
      const data = await res.json().catch(() => ({ error: "Reset failed" }));
      alert(data.error || "Reset failed");
    }
  }

  // ---------- UI helpers ----------
  function TrialButton({ trialKey }) {
    const used = opened[trialKey];
    return (
      <button
        className={`trial-btn ${used ? "used" : ""}`}
        onClick={() => {
          setOpened({ ...opened, [trialKey]: true });
          setSelectedTrial(trialKey);
        }}
      >
        {trialKey}
      </button>
    );
  }

  function ActivitySeries({ data }) {
    const reagents = [
      "AgNO3",
      "Al(NO3)3",
      "Ca(NO3)2",
      "Fe(NO3)2",
      "KNO3",
      "SnCl2 in HCl",
      "Zn(NO3)2",
      "Cu(NO3)2",
    ];
    const [clicked, setClicked] = useState({});
    return (
      <div className="grid-2">
        {reagents.map((r) => (
          <div
            key={r}
            className={`reagent ${clicked[r] ? "used" : ""}`}
            onClick={() => setClicked({ ...clicked, [r]: true })}
          >
            <div className="reagent-title">{r}</div>
            <div className="reagent-body">
              {clicked[r] ? data[r] : <span className="muted">click to observe</span>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ---------------- VIEWS ----------------
  if (view === "login") {
    return (
      <div className="page">
        {/* About button */}
        <button className="about-btn" onClick={() => setShowAbout(true)}>
          About
        </button>

        <div className="card">
          <h1>MX Lab Assesemnt</h1>
          <form className="stack" onSubmit={handleLogin}>
            <input placeholder="Full Name" onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            <input
              placeholder="950 Number"
              inputMode="numeric"
              maxLength={8}
              pattern="\d{8}"
              onChange={(e) => setForm({ ...form, id950: e.target.value })}
            />
            <input placeholder="Class Period (e.g: 2)" onChange={(e) => setForm({ ...form, period: e.target.value })} />
            <input
              type="password"
              placeholder="Password"
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <button className="primary" type="submit">Enter</button>
          </form>
        </div>

        {/* Teacher Tools button */}
        <button className="teacher-fab" onClick={() => { setShowTeacher(true); setTeacherAuthed(false); }}>
          Teacher Tools
        </button>

        {/* Teacher Modal */}
        {showTeacher && (
          <div className="modal" onClick={() => setShowTeacher(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <strong>Teacher Tools</strong>
                <button onClick={() => setShowTeacher(false)}>✕</button>
              </div>
              <div className="modal-body">
                {!teacherAuthed ? (
                  <>
                    <p className="muted">Enter teacher password to unlock tools.</p>
                    <input
                      type="password"
                      placeholder="Teacher password"
                      value={teacherPwd}
                      onChange={(e) => setTeacherPwd(e.target.value)}
                    />
                    <div className="row">
                      <button onClick={() => setShowTeacher(false)}>Cancel</button>
                      <button className="primary" onClick={teacherLogin}>Unlock</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="muted">Tools unlocked.</p>
                    <div className="row" style={{ justifyContent: "flex-start" }}>
                      <button onClick={downloadResultsCSV}>See results (download CSV)</button>
                      <button style={{ background: "#b91c1c", color: "#fff" }} onClick={() => setShowConfirmReset(true)}>
                        Reset results
                      </button>
                    </div>
                    {showConfirmReset && (
                      <div style={{ marginTop: "12px" }}>
                        <div className="card" style={{ padding: "12px", border: "1px solid #ddd" }}>
                          <div style={{ textAlign: "left" }}><strong>Confirm reset?</strong></div>
                          <div className="muted" style={{ textAlign: "left" }}>
                            This will clear <em>results.csv</em> and reset all active 950 assignments.
                          </div>
                          <div className="row">
                            <button onClick={() => setShowConfirmReset(false)}>Cancel</button>
                            <button className="primary" onClick={resetAllData}>Yes, reset</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* About Modal */}
        {showAbout && (
          <div className="modal" onClick={() => setShowAbout(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <strong>About This Site</strong>
                <button onClick={() => setShowAbout(false)}>✕</button>
              </div>
              <div className="modal-body" style={{ textAlign: "left", lineHeight: "1.6" }}>
                <h3>Who are we?</h3>
                <p>Just a small group of TAs trying to make life easier for Dr. Mellows.</p>
                <h3>What is this website?</h3>
                <p>This is Henry M. Gunn High School's official Mellows Chem H MX Lab assessment website.</p>
                <h3>Creator:</h3>
                <ul style={{ listStyle: "none", paddingLeft: 0 }}>
                  <li>Andersen Tanriverdi (<a href="mailto:andersentanriverdi@gmail.com">andersentanriverdi@gmail.com</a>)</li>
                </ul>
                <h3>Special Thanks:</h3>
                <ul style={{ listStyle: "none", paddingLeft: 0 }}>
                  <li>Nate Yoon</li>
                  <li>Doyoon Kim</li>
                  <li>Xiwen Liang</li>
                  <li>Madeleine</li>
                  <li>Frank Zhang</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------- Trials view --------
  return (
    <div className="page">
      {/* About button */}
      <button className="about-btn" onClick={() => setShowAbout(true)}>
        About
      </button>

      <div className="card">
        <h2>Trials</h2>
        <div className="stack trial-list">
          {Object.keys(trials).map((k) => (
            <TrialButton key={k} trialKey={k} />
          ))}
        </div>

        <div className="submit-row">
          <input placeholder="Predicted Metal? (Only write symbol e.g: Au)" onChange={(e) => setGuess(e.target.value)} />
          <button className="primary" onClick={handleSubmitGuess}>Submit</button>
        </div>
      </div>

      {/* Teacher button */}
      <button className="teacher-fab" onClick={() => { setShowTeacher(true); setTeacherAuthed(false); }}>
        Teacher Tools
      </button>

      {/* Trial Modal */}
      {selectedTrial && (
        <div className="modal" onClick={() => setSelectedTrial(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>{selectedTrial}</strong>
              <button onClick={() => setSelectedTrial(null)}>✕</button>
            </div>
            <div className="modal-body">
              {typeof trials[selectedTrial] === "string" ? (
                <p>{trials[selectedTrial]}</p>
              ) : (
                <ActivitySeries data={trials[selectedTrial]} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Teacher Modal */}
      {showTeacher && (
        <div className="modal" onClick={() => setShowTeacher(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>Teacher Tools</strong>
              <button onClick={() => setShowTeacher(false)}>✕</button>
            </div>
            <div className="modal-body">
              {!teacherAuthed ? (
                <>
                  <p className="muted">Enter teacher password to unlock tools.</p>
                  <input
                    type="password"
                    placeholder="Teacher password"
                    value={teacherPwd}
                    onChange={(e) => setTeacherPwd(e.target.value)}
                  />
                  <div className="row">
                    <button onClick={() => setShowTeacher(false)}>Cancel</button>
                    <button className="primary" onClick={teacherLogin}>Unlock</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted">Tools unlocked.</p>
                  <div className="row" style={{ justifyContent: "flex-start" }}>
                    <button onClick={downloadResultsCSV}>See results (download CSV)</button>
                    <button style={{ background: "#b91c1c", color: "#fff" }} onClick={() => setShowConfirmReset(true)}>
                      Reset results
                    </button>
                  </div>
                  {showConfirmReset && (
                    <div style={{ marginTop: "12px" }}>
                      <div className="card" style={{ padding: "12px", border: "1px solid #ddd" }}>
                        <div style={{ textAlign: "left" }}><strong>Confirm reset?</strong></div>
                        <div className="muted" style={{ textAlign: "left" }}>
                          This will clear <em>results.csv</em> and reset all active 950 assignments.
                        </div>
                        <div className="row">
                          <button onClick={() => setShowConfirmReset(false)}>Cancel</button>
                          <button className="primary" onClick={resetAllData}>Yes, reset</button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* About Modal */}
      {showAbout && (
        <div className="modal" onClick={() => setShowAbout(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>About This Site</strong>
              <button onClick={() => setShowAbout(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ textAlign: "left", lineHeight: "1.6" }}>
              <h3>Who are we?</h3>
              <p>Just a small group of TAs trying to make life easier for Dr. Mellows.</p>
              <h3>What is this website?</h3>
              <p>This is Henry M. Gunn High School's official Mellows Chem H MX Lab assessment website.</p>
              <h3>Creator:</h3>
              <ul style={{ listStyle: "none", paddingLeft: 0 }}>
                <li>Andersen Tanriverdi (<a href="mailto:andersentanriverdi@gmail.com">andersentanriverdi@gmail.com</a>)</li>
              </ul>
              <h3>Special Thanks:</h3>
              <ul style={{ listStyle: "none", paddingLeft: 0 }}>
                <li>Nate Yoon</li>
                <li>Doyoon Kim</li>
                <li>Xiwen Liang</li>
                <li>Madeleine Kang</li>
                <li>Frank Zhang</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
