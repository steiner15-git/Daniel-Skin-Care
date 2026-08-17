import { useNavigate } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";

export default function SettingsSubHeader({ title }) {
  const navigate = useNavigate();
  return (
    <ScreenHeader
      title={title}
      action={
        <button className="btn btn--ghost" onClick={() => navigate("/settings")}>
          חזרה
        </button>
      }
    />
  );
}
