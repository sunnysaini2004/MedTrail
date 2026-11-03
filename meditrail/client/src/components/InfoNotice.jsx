import { Info } from "lucide-react";

function InfoNotice({ children }) {
  return (
    <div className="demo-note" role="note">
      <Info size={17} strokeWidth={1.8} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export default InfoNotice;
