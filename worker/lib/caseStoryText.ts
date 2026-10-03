// Fact-checked case stories (spec 2026-10-03-realufo-case-stories-design).
// Worker-only — never import into the SPA. Every claim cites `sources`
// (realufo files by id + PDF page; outside files by url + PDF page).
import type { CaseStory } from "./caseStories";


export const CASE_STORY_TEXT: Record<string, CaseStory> = {
  socorro: {
    title: "Socorro 1964: one officer, four marks, no identified craft",
    sections: [
      {
        heading: "A chase abandoned",
        paras: [
          "The Air Force's own summary of the case begins at about 5:45 p.m. on 24 April 1964, roughly a mile south of Socorro, New Mexico. Police officer Lonnie Zamora was chasing a speeding car when he heard a roar and saw flames in an area where a dynamite shack was known to stand. Thinking it had exploded, he abandoned the chase, took a little-used road and had considerable difficulty getting his car up a gravel-covered hill [4].",
          "In the statement he gave the FBI, Zamora said he then noticed a shiny object 150 to 200 yards to the south, off the road, that at first looked like a car turned upside down. He saw two people in white coveralls very close to it; one seemed to turn, look straight at his car and jump, as if startled. He also noticed two \"legs\" slanting outward from the object to the ground, and said it was like aluminum, \"whitish against the mesa background, but not chrome\" [2].",
        ],
        quote: { text: "Saw two people in white coveralls very close to the object.", who: "Lonnie Zamora, statement recorded by the FBI", src: 2 },
      },
      {
        heading: "Roar, flame and take-off",
        paras: [
          "According to the Air Force summary, Zamora radioed headquarters that he was going to check what he believed was a car accident, drove to a point about 150 feet from the gully and got out on foot. He described the object as white, egg or oval-shaped and apparently supported on girderlike legs. He then heard a roar and saw smoke and flame coming from its bottom. Believing it was about to explode, he ran to shelter behind his police car, bumping his leg and losing his glasses on the way [4].",
          "From cover, the summary says, he saw the object rise to about 15 to 20 feet, noted a red marking on it (a crescent with a vertical arrow and a horizontal line beneath) and watched it hold still for several seconds before flying off along the gully [4]. The documents do not agree on its direction: the summary says it went south, the project record card lists \"Stationary, SW or West\", and Hynek wrote in 1965 that it took off to the west [4][3][10].",
          "Popular retellings often have Zamora watching the craft's occupants; the Air Force summary states that he saw the figures only during his first glance, from about 800 feet, and did not see them again [4]. TSgt David Moody, who went to Socorro with Major Conner on 26 April, wrote that Zamora's description of the object was vague, with the red marking the only specific detail, and that Sergeant Chavez of the New Mexico State Police reached the scene about three minutes after the object disappeared [6].",
        ],
      },
      {
        heading: "What was left on the ground",
        paras: [
          "FBI Special Agent D. Arthur Byrnes, Jr. was on business at the State Police office in Socorro that afternoon. After 6:00 p.m. he went to the site, where Zamora, Undersheriff Jim Luckie, Sergeant M. S. Chavez and Officer Ted Jordan had gathered. He noted four indentations in the rough ground where Zamora described the object, and recorded that Zamora, whom he had known for about five years, was regarded as sober, industrious and conscientious [1].",
          "The Air Force summary adds that Chavez found slight depressions and apparently burned brush that was cold to the touch [4]. Moody recorded that local radar stations carried no unidentified tracks at the time and that the White Sands helicopters were at the other end of the range and not operating; he concluded that no cause could be determined by himself or Major Conner [6].",
          "Laboratory analysis reported in the summary found no foreign material or above-normal radiation in the soil samples, and no chemicals in the burned brush that would indicate a type of propellant [5]. Later claims that the site yielded exotic residue or radioactivity are not supported by these results.",
        ],
        quote: { text: "Laboratory analysis of soil samples disclosed no foreign material or radiation above normal for the surrounding area.", who: "Air Force case summary, Project Blue Book file", src: 5 },
      },
      {
        heading: "Hynek's assessment",
        paras: [
          "J. Allen Hynek flew to Albuquerque on Tuesday, 28 April 1964, at Captain Quintanilla's request, to meet Major Conner of Kirtland Air Force Base. By phone, Dr. LaPaz, who years earlier had worked with Zamora on a field trip in search of a fallen meteorite, told him Zamora was a completely reliable person. That evening Hynek spent about two hours with Zamora and Chavez at the Socorro jail [7].",
          "In his report Hynek recorded that Zamora had asked whether he should speak to the priest before saying anything, wrote that any question of hallucination seemed clearly out, and found that the site had been trampled so badly that he could not assess the burned areas. He expected that NICAP and APRO would treat Socorro as the best authenticated landing sighting on record, and urged the Air Force to spare no effort in establishing whether any military maneuvers had been taking place in the area [8].",
        ],
        quote: { text: "Zamora saw a tangible, physical object, under good daylight illumination, and from fairly close range", who: "J. Allen Hynek, report on his Socorro trip, 1964", src: 8 },
      },
      {
        heading: "Explanations tried, and the file's verdict",
        paras: [
          "The project record card says the sighting was initially believed to be an observation of a lunar-module-type configuration, but that effort to date could not place a vehicle at the site. The card carries the case as UNIDENTIFIED pending additional data [3].",
          "Hynek went back to Socorro in March 1965 and used a critical letter from Menzel to re-examine the case. Zamora now denied having said anything about a flame when he first heard the explosion, though the Air Force summary of his account has him seeing flames at that moment [9][4]. Hynek agreed with Menzel that this part of the evidence was \"very mixed up\" and suggested some embroidery, either by Zamora or by Captain Holder, whose original report included it [9].",
          "Hynek rejected the idea that local teenagers who disliked Zamora had staged a hoax. LaPaz believed a hoax would have leaked by then, and a tourist passing through had separately reported a strange object; Hynek judged it entirely too big a hoax for high school students to perpetrate [10].",
          "No document in the file identifies what Zamora saw. The Air Force summary states that there was no evidence the object was extraterrestrial in origin or a threat to the security of the United States, and that the investigation was continuing [5].",
        ],
      },
    ],
    timeline: [
      { date: "1964-04-24", event: "About 5:45 p.m.: Zamora abandons a car chase to investigate a roar and flames south of Socorro.", src: 4 },
      { date: "1964-04-24", event: "FBI agent D. Arthur Byrnes, Jr. reaches the site after 6:00 p.m. and notes four indentations.", src: 1 },
      { date: "1964-04-26", event: "TSgt Moody and Major Conner visit Socorro; Moody reports that no cause could be determined.", src: 6 },
      { date: "1964-04-28", event: "J. Allen Hynek arrives and interviews Zamora and Chavez that evening.", src: 7 },
      { date: "1964-05-08", event: "FBI Albuquerque office dates its memorandum on the Socorro object.", src: 1 },
      { date: "1965-03-12", event: "Hynek returns to Socorro and reviews the case against a critical letter from Menzel.", src: 9 },
    ],
    sources: [
      { id: "65-hs1-834228961-62-hq-83894-serial-438", page: 2, note: "FBI Albuquerque memo: Byrnes at the site" },
      { id: "65-hs1-834228961-62-hq-83894-serial-438", page: 11, note: "Zamora's statement to the FBI" },
      { url: "https://catalog.archives.gov/id/302532129?objectPage=4", note: "Blue Book record card, Socorro" },
      { url: "https://catalog.archives.gov/id/302532129?objectPage=12", note: "Air Force case summary, page 1" },
      { url: "https://catalog.archives.gov/id/302532129?objectPage=11", note: "Air Force case summary, lab results" },
      { url: "https://catalog.archives.gov/id/302532129?objectPage=64", note: "TSgt Moody's report, 26 April 1964" },
      { url: "https://catalog.archives.gov/id/302532129?objectPage=65", note: "Hynek's trip report, 28 April 1964" },
      { url: "https://catalog.archives.gov/id/302532129?objectPage=69", note: "Hynek's trip report, conclusions" },
      { url: "https://catalog.archives.gov/id/302532129?objectPage=44", note: "Hynek's March 1965 return-trip report" },
      { url: "https://catalog.archives.gov/id/302532129?objectPage=47", note: "Hynek 1965 report on hoax theory" },
    ],
    updated: "2026-10-03",
  },
  kaikoura: {
    title: "Kaikoura 1978: what the RNZAF and DSIR files concluded",
    sections: [
      {
        heading: "Two nights, one investigation",
        paras: [
          "The RNZAF's own report sets out the basic facts. On the nights of 20/21 and 30/31 December 1978, Wellington air traffic control radar and the crews of Safe Air Argosy freighters, both visually and on the aircraft's radar, made many unidentified sightings off the east coast of the South Island [1]. The Civil Aviation Division of the Ministry of Transport told Air Staff about the first night mid-morning on 21 December. Defence had historically kept a 'low profile' on such reports, but because of the number and nature of that night's reports the Director of Civil Aviation specifically told his staff to inform it [1].",
          "Air Staff asked to be called if anything similar happened again, but the memo meant for the air traffic control centre was never delivered, so the events of 30/31 December reached Air Staff only the next day [1]. After heavy media coverage, the RNZAF decided to fly an Orion surveillance flight over the area on the night of 2/3 January 1979, and a Defence investigation began at the same time [1]. Witnesses were told it was not a judicial enquiry, and the credibility of their statements was taken at face value [1].",
        ],
      },
      {
        heading: "20/21 December: returns off the Clarence River",
        paras: [
          "On the first night, Wellington radar asked Argosy captains to look at returns it was painting in the Clarence River area [2]. The same radar also tracked a steady return that moved out from Wellington, stayed stationary for 35 minutes and then appeared to 'track' the second southbound Argosy at about 0328. Told of a strong return about 25 miles to port, the crew saw a very bright light they described as a bright orb, pear-shaped, with a reddish tinge that then turned white. It looked stationary to the eye but seemed to follow the aircraft on its radar, and the crew could not confirm that the light and the radar return were at the same range [2].",
          "Later, about 50 miles north-east of Christchurch, the captain saw five consecutive blips on the aircraft radar trace a path towards the aircraft over five seconds and veer sharply to port, while the co-pilot saw a flashing white light, like a strobe, follow the same path. The report worked out a speed of about 10,800 mph and suggested a meteor, or a 'double bounce' radar contact caused by ducting [3]. On the ground at RNZAF Base Woodbourne, the orderly officer saw three lights at 2350 that he first took for a Bristol Freighter [3]; the report judged it highly improbable that these lights and the radar returns were connected [4].",
        ],
        quote: { text: "This sighting, above all others during the night, caused the crew considerable consternation!", who: "RNZAF report on the 20/21 December flights", src: 3 },
      },
      {
        heading: "30/31 December: the filmed flight",
        paras: [
          "At 11:46 pm on 30 December, Captain Bill Startup and co-pilot Robert Guard left Wellington on a newspaper delivery run to Christchurch. With them were Australian reporter Quentin Fogarty and a film crew, cameraman David Crockett and his wife Ngaire, who ran the tape recorder; a Melbourne TV station had commissioned them to film a story about the earlier sightings [9]. Crockett shot 16 mm colour film of the cabin, the lights of Kaikoura and bright objects seen ahead and to the right, while Wellington radar reported targets near the plane. The aircraft's own radar was not used on the way south [9].",
          "On the flight back north from Christchurch, the crew watched a light with 'the appearance of a squashed orange' that, measured against a thumb at arm's length, looked about two inches long [5]. Between 35 and 40 miles from Christchurch the captain turned towards it. The image on the aircraft radar moved to 10 miles away and then held the same position relative to the aircraft for a few minutes, before the light appeared to go above, behind and below the aircraft. Christchurch radar was working but reported nothing, and Wellington radar reported no unidentified contact in that area [5].",
        ],
      },
      {
        heading: "What the RNZAF concluded",
        paras: [
          "For the bright light of 20/21 December the report's answer was Venus, which was rising within a few minutes on the same bearing; DSIR experts said the conditions could have made it look large, bright and orange [2]. It found the 31 December light also consistent with an unusual view of Venus, although the sighting came at about 0225 and Venus did not rise until about 0328; DSIR advised that super refraction could make the planet visible earlier. It offered an atmospheric inversion layer for the light's apparent movement around the aircraft, and called the radar return probably spurious or a ship [5].",
          "The report also pointed to the radar and the sea. Wellington's radar had been giving anomalous returns for months, possibly after a recent modification that tilted its head down by one degree, and conditions favoured freak propagation of radio and light waves [2]. Some 50 Japanese squid boats had sailed from Wellington between 19 and 28 December on a track almost identical to one plotted by Wellington radar, each putting out about 200 kW of light when fishing [3]. The report acknowledged the crews' evident concern: they did not seem prepared to accept that they might have seen Venus, though neither did they believe they had seen a visitor from outer space [4]. Its final finding, signed by the Director of Operations, a wing commander, was that the few sightings still inconclusive might be explained once investigations were completed [6].",
        ],
        quote: { text: "Almost all the sightings can be explained by natural but unusual phenomena.", who: "Director of Operations, RNZAF report", src: 6 },
      },
      {
        heading: "The scientists' view, and its limits",
        paras: [
          "DSIR's interim report reached a similar view. It found that most substantive sightings occurred from about 3 a.m., looking east and low on the horizon, and that these fit the rising of Venus but not the planet's normal appearance [7]. It put Startup's main sighting shortly after 0230, some 10 minutes before Venus should have risen at the aircraft's altitude, and called the description classic for a strongly refracted planet [7]. The RNZAF report's figures put the sighting about an hour before Venus rose; DSIR's put it about ten minutes before [5][7]. DSIR also saw little merit in analysing Crockett's 31 December film further, because the recorded image was almost entirely due to imperfections in the Argosy's window [7].",
          "On the night of 7/8 January a DSIR officer watched many unidentified returns at the Wellington control centre, while three ground parties on the Kaikoura coast, in radio contact with him, saw nothing to suggest they were anything other than known targets or spurious returns [8]. But DSIR listed two pieces of data that did not fit its pattern: the pulsating light that approached Captain Vern Powell's aircraft on 20/21 December with an on-board radar return, at an estimated 15,000 km per hour, and the large on-board radar signal on Startup's flight, indicating an object keeping station at about 16 km. It suggested meteorite showers for the first and an atmospheric mirror reflection for the second [8].",
          "Popular accounts often describe Kaikoura as officially unexplained; the file's reports instead attribute almost all of the sightings to Venus, ships' lights and spurious radar returns, while DSIR left two radar-linked observations outside that explanation [6][8]. An independent 1979 summary of the 30/31 December flights by Bruce Maccabee is also kept in the file [9].",
        ],
      },
      {
        heading: "The file",
        paras: [
          "The papers sit in Defence file AIR 1080/6/897, 'Investigations of Unidentified & Radar Sightings East Coast South Island – December 1978', opened in 1978 and closed in 1981 [10]. It holds RNZAF interviews with people involved, technical reports from DSIR and other scientific experts, and an independent report of the sightings by the NZ UFO Studies Centre. The NZDF declassified it in December 2010 for public release; access to the original file remains restricted until 2051 [10].",
        ],
      },
    ],
    timeline: [
      { date: "1978-12-21", event: "Wellington radar asks Argosy crews to check returns off the Clarence River; a crew reports a bright light their radar appears to track.", src: 2 },
      { date: "1978-12-21", event: "Civil Aviation Division informs RNZAF Air Staff mid-morning.", src: 1 },
      { date: "1978-12-30", event: "Startup's Argosy leaves Wellington at 11:46 pm with Quentin Fogarty and a film crew aboard.", src: 9 },
      { date: "1978-12-31", event: "Flying north from Christchurch, the crew turn towards a large light at about 0225; Christchurch radar reports nothing.", src: 5 },
      { date: "1979-01-02", event: "Night of 2/3 January: RNZAF Orion surveillance of the area; a Defence investigation is launched at that time.", src: 1 },
      { date: "1979-01-08", event: "Night of 7/8 January: DSIR watches Wellington radar; Kaikoura coast ground parties see nothing to match returns.", src: 8 },
      { date: "2010-12", event: "NZDF declassifies file AIR 1080/6/897 for public release.", src: 10 },
    ],
    sources: [
      { url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf", page: 191, note: "RNZAF report: introduction" },
      { url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf", page: 193, note: "RNZAF report: radar, 21 Dec light, Venus" },
      { url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf", page: 194, note: "RNZAF report: squid fleet, radar blips" },
      { url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf", page: 195, note: "RNZAF report: 20/21 December summary" },
      { url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf", page: 197, note: "RNZAF report: 31 December flight north" },
      { url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf", page: 199, note: "RNZAF report: conclusions and signature" },
      { url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf", page: 135, note: "DSIR interim report: findings, Argosy film" },
      { url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf", page: 136, note: "DSIR interim report: radar, unexplained data" },
      { url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf", page: 19, note: "Maccabee 1979 summary of filmed flight" },
      { url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf", page: 1, note: "NZDF release cover sheet" },
    ],
    updated: "2026-10-03",
  },
};
