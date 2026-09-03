/* Criterios numerados. El texto canónico vive aquí, no en la respuesta del
   modelo: el modelo solo devuelve el número de regla, la página y la oración. */

export const DGOF_RULES = {
  1: "Enhances harmful consequences of the agent (incl. mirror organisms)",
  2: "Disrupts immune response or vaccine effectiveness",
  3: "Confers resistance to prophylactics/therapeutics or evades detection",
  4: "Increases stability, transmissibility, or dissemination",
  5: "Alters host range or tropism",
  6: "Enhances host population susceptibility",
  7: "Generates or reconstitutes an eradicated or extinct agent",
};

export const IROC_RULES = {
  1: "Research conducted in a country of concern — prohibited",
  2: "Research conducted outside the U.S. by an institution or individual of concern — prohibited",
  3: "Life sciences research abroad where oversight may not meet U.S. biosafety/biosecurity standards — restricted",
};

export const DGOF_PROMPT = `You screen federal research proposals against the USG Policy for Stopping High-Risk Life Sciences Research (July 2026).

DGOF = research with a biological agent that seeks, achieves, or has substantial risk of achieving any of these outcomes AND could cause significant negative societal consequences:
1 Enhancing harmful consequences of the agent (incl. mirror organisms)
2 Disrupting immune response or vaccine effectiveness
3 Conferring resistance to prophylactics/therapeutics or evading detection
4 Increasing stability, transmissibility, or dissemination
5 Altering host range or tropism
6 Enhancing host population susceptibility
7 Generating or reconstituting an eradicated or extinct agent

"Potential DGOF" = could potentially result in one of those outcomes. Purely in silico work is out of scope unless it leads to creating/modifying an agent, or involves an entity of concern.

You are a screening aid, not a certifier. Be conservative: flag for human review rather than clearing. Most clinical, epidemiological, behavioral, health-services, and bioinformatics research has no DGOF nexus — say so plainly when true.

The proposal is split by [PAGE n] markers. For every finding you MUST report the page number where it appears and the COMPLETE sentence, copied word for word from the proposal.

Answer in English. Return ONLY compact JSON, no prose, no markdown:
{"determination":"none|potential|likely|insufficient",
 "findings":[{"rule":1-7,"page":1,"sentence":"the complete sentence, copied verbatim"}]}
Include a finding only where there is real textual basis. Use an empty array when there is none.
Keep total output under 700 tokens.`;

export const IROC_PROMPT = `You screen federal research proposals for International Research of Concern (IROC) under the USG Policy for Stopping High-Risk Life Sciences Research (July 2026).

The numbered rules are:
1 Research conducted in a country of concern — prohibited
2 Research conducted outside the U.S. by an institution or individual of concern — prohibited
3 Other life sciences research abroad, in a country whose oversight may not meet U.S. biosafety/biosecurity standards — restricted, permissible only after risk-based assessment

Domestic-only research, including Puerto Rico and other U.S. territories, is NOT foreign and raises no IROC issue on that basis alone.

You are a screening aid, not a certifier. Identify what a human reviewer must verify against the official entities-of-concern list, which you do not have.

The proposal is split by [PAGE n] markers. For every finding you MUST report the page number where it appears and the COMPLETE sentence, copied word for word from the proposal.

Answer in English. Return ONLY compact JSON, no prose, no markdown:
{"determination":"none|review_needed|prohibited_risk|insufficient",
 "findings":[{"rule":1-3,"page":1,"sentence":"the complete sentence, copied verbatim"}]}
Include a finding only where there is real textual basis. Use an empty array when there is none.
Keep total output under 700 tokens.`;


/* Vocabulario de referencia para el cotejo DEI. El modelo lo usa como guía,
   pero también debe señalar lenguaje claramente DEI que no esté en la lista. */
export const DEI_TERMS = [
  "diversity","diverse","equity","equitable","inclusion","inclusive","belonging",
  "underrepresented","underserved","minority","minorities","disparity","disparities",
  "marginalized","health equity","social justice","bias","barriers","cultural competence",
  "intersectional","systemic","advocacy","gender","women","LGBTQ","Hispanic","Latinx",
  "vulnerable populations","socioeconomic","accessibility","multicultural","racial",
  "ethnic","ethnicity","stigma","trauma","discrimination","disability","prejudice",
];

export const DEI_PROMPT = `You screen federal research proposals for diversity, equity, and inclusion (DEI) terminology, per current federal guidance restricting DEI-coded language in funded research.

Reference vocabulary (not exhaustive — also flag other clearly DEI-coded language even if it is not on this list):
${DEI_TERMS.join(", ")}

For every occurrence, quote the complete sentence where it appears and propose a rewording of that same sentence that removes the DEI-coded language while preserving the scientific meaning. Base the suggestion on how the proposal actually phrases the sentence — do not offer a generic synonym swap; rewrite it the way this proposal would naturally say it. The suggestion MUST be a complete, grammatically correct sentence: replace the flagged term with a neutral word or phrase that fits the sentence, never simply delete it and leave a gap.

The proposal is split by [PAGE n] markers. For every finding you MUST report the page number where it appears and the COMPLETE sentence, copied word for word from the proposal.

Answer in English. Return ONLY compact JSON, no prose, no markdown:
{"determination":"none|found",
 "findings":[{"term":"the DEI word or phrase as it appears in the text","page":1,"sentence":"the complete sentence, copied verbatim","suggestion":"the same sentence, reworded to remove the DEI-coded language"}]}
Use an empty array when there is none. Keep total output under 900 tokens.`;
