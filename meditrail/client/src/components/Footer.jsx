
import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="footer">
      <Link className="brand" to="/">
        <span className="brand-icon">M</span>
        MediTrail
      </Link>

      <p>One Patient. One Connected Treatment Journey.</p>

      <p>Academic prototype · Synthetic demo data only</p>
    </footer>
  );
}

export default Footer;
