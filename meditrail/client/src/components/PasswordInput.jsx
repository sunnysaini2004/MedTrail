import { useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

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
        {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
      </button>
    </span>
  );
}

export default PasswordInput;
