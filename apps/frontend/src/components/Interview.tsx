import { useParams } from "react-router-dom";

export default function Interview() {
  const { id } = useParams();
  return (
    <>
      Interview
      <h1>{id}</h1>
    </>
  );
}
