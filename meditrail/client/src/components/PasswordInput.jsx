import { useRef, useState } from "react";

function PasswordInput({ className = "", ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef(null);

  function toggleVisibility() {
    const input = inputRef.current;
    const start = input?.selectionStart;
    const end = input?.selectionEnd;
    setVisible((current) => !current);
    requestAnimationFrame(() => {
      if (!input || start == null || end == null) return;
      input.focus();
      input.setSelectionRange(start, end);
    });
  }

  return (
    <span className="relative block w-full">
      <input
        {...inputProps}
        ref={inputRef}
        type={visible ? "text" : "password"}
        className={(className + " pr-12").trim()}
      />
      <button
        type="button"
        className="absolute right-1.5 top-1/2 inline-flex min-h-10 min-w-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggleVisibility}
      >
        {visible ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7" strokeLinecap="round" />
            <path d="M9.9 5.2A10.8 10.8 0 0112 5c5.1 0 8.5 4.3 9.5 6.3a1.5 1.5 0 010 1.4 14 14 0 01-3.2 3.8M6.2 6.2a14.4 14.4 0 00-3.7 5.1 1.5 1.5 0 000 1.4C3.5 14.7 6.9 19 12 19c1.2 0 2.3-.2 3.3-.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
            <path d="M2.7 12s3.3-6.5 9.3-6.5 9.3 6.5 9.3 6.5-3.3 6.5-9.3 6.5S2.7 12 2.7 12z" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        )}
      </button>
    </span>
  );
}

export default PasswordInput;
