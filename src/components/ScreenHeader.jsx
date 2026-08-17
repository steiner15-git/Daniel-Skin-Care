// כותרת מסך עם מפריד עלה-זהב (אלמנט חתימה — סעיף 5 ב-PRD)
export default function ScreenHeader({ title, action, logo }) {
  return (
    <>
      <div className="screen-title">
        <div className="screen-title__lead">
          {logo && <img className="screen-logo" src={logo} alt="" />}
          <h1>{title}</h1>
        </div>
        {action}
      </div>
      <hr className="leaf-divider" />
    </>
  );
}
