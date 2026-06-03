import { useState } from "react";
import { Medal, Users } from "lucide-react";
import { IndividualCareerTab } from "./IndividualCareerTab";
import { ConstructorsCareerTab } from "./ConstructorsCareerTab";

type SubTab = "individual" | "constructors";

export function CareerTab() {
  const [sub, setSub] = useState<SubTab>("individual");

  return (
    <>
      <div className="mb-4 flex gap-2 rounded-xl p-1" style={{ backgroundColor: "#1A1A1A" }}>
        <button
          onClick={() => setSub("individual")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
            sub === "individual" ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"
          }`}
        >
          <Medal className="h-3.5 w-3.5" />
          Individual
        </button>
        <button
          onClick={() => setSub("constructors")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
            sub === "constructors" ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          Ordem dos Construtores
        </button>
      </div>
      {sub === "individual" ? <IndividualCareerTab /> : <ConstructorsCareerTab />}
    </>
  );
}

export default CareerTab;
