// Fact-checked case stories (spec 2026-10-03-realufo-case-stories-design).
// Worker-only — never import into the SPA. Every claim cites `sources`
// (realufo files by id + PDF page; outside files by url + PDF page).
// Researched against primary documents 2026-10-03; see the per-story evidence
// lists in the session that wrote them. Reviewed by the owner before deploy.
import type { CaseStory } from "./caseStories";

export const CASE_STORY_TEXT: Record<string, CaseStory> = {
  roswell: {
    title: "Roswell 1947: a ranch, a 'flying disc' and a balloon project",
    sections: [
      {
        heading: "What was reported in July 1947",
        paras: [
          "On 8 July 1947 the public information office at Roswell Army Air Field (RAAF), New Mexico, reported the crash and recovery of a \"flying disc\", crediting personnel of the 509th Bomb Group. The following day the press reported that the Commanding General of the Eighth Air Force at Fort Worth had announced that RAAF personnel had recovered a crashed radar-tracking (weather) balloon, not a \"flying disc\" [7].",
          "The 1994 Air Force report on the case summarises the local coverage. The Roswell Daily Record of 8 July said the 509th's intelligence officer, Major Jesse A. Marcel, had recovered the disc from a rancher's land; on 9 July it quoted Brigadier General Roger Ramey as saying the debris was a weather balloon, and named the rancher as W. W. Brazel. Brazel said he and his son found the material on 14 June, picked some up on 4 July and went to Roswell on 7 July, where he contacted the sheriff. He estimated the whole lot weighed maybe five pounds and said it did not resemble two weather balloons he had found before [2]."
        ],
        quote: {
          text: "came upon a large area of bright wreckage made up of rubber strips, tinfoil, a rather tough paper, and sticks.",
          who: "W. W. Brazel's account, Roswell Daily Record, 9 July 1947",
          src: 2
        }
      },
      {
        heading: "The only two records from 1947",
        paras: [
          "Searching at the request of Congressman Steven Schiff, the General Accounting Office (GAO) found just two government records that originated in 1947 [8]. One is the July 1947 history of the 509th Bomb Group and RAAF, which says the information office was kept busy answering inquiries on the \"flying disc\" and that \"The object turned out to be a radar tracking balloon\" [9].",
          "The other is an FBI teletype sent from Dallas on the evening of 8 July. It records that an Eighth Air Force headquarters official had reported an object purporting to be a flying disc recovered near Roswell, that it resembled a high-altitude weather balloon with a radar reflector, and that the disc and balloon were being flown to Wright Field for examination. No further FBI investigation was being conducted [10]."
        ],
        quote: {
          text: "The disc is hexagonal in shape and was suspended from a ballon by cable, which ballon was approximately twenty feet in diameter.",
          who: "FBI Dallas teletype, 8 July 1947",
          src: 10
        }
      },
      {
        heading: "Thirty years of quiet, then a revival",
        paras: [
          "The Air Force found that Ramey's press conference and Brazel's statement effectively ended the matter until 1978; Roswell does not appear in Project Blue Book or its predecessors. In 1978 a tabloid reported Marcel's claim to have recovered UFO debris and researcher Stanton Friedman met him; William L. Moore and Charles Berlitz published The Roswell Incident in 1980 [3].",
          "The report traced how the story grew: from a little debris at one site to airplane loads from several debris fields, from sticks, paper, tape and tinfoil to exotic metals with hieroglyphics, and in most versions a second site where alien bodies were said to have been retrieved [3]. The descriptions recorded in 1947 are of foil, rubber, paper, sticks and a balloon with a radar reflector [2][10]."
        ]
      },
      {
        heading: "The 1994 Air Force review",
        paras: [
          "The Air Force research for the GAO audit, dated July 1994, found no records of a \"cover-up\" or of any recovery of alien bodies or extraterrestrial materials. It concluded that the debris was consistent with a balloon device, most likely from the then TOP SECRET Project Mogul, which used balloons to try to monitor Soviet nuclear tests [1].",
          "Sheridan Cavitt, credited in all accounts with accompanying Marcel to the ranch, gave a sworn statement on 24 May 1994 describing reflective material like aluminum foil, thin bamboo-like sticks and a small \"black box\" he took for a radiosonde, and said he had never been sworn to secrecy or threatened. Irving Newton, a weather officer at Fort Worth in July 1947, stated that the material in Ramey's office was a balloon and a RAWIN radar target [4].",
          "Professor Charles B. Moore, whose New York University group flew the balloons, judged the debris most probably came from Flight 4, launched on 4 June 1947 and never recovered by the group. The report also said no documented evidence was found to explain why the \"flying disc\" announcement was made [5]."
        ],
        quote: {
          text: "I told them that this was a balloon and a RAWIN target",
          who: "Irving Newton, sworn statement to the Air Force, 1994",
          src: 4
        }
      },
      {
        heading: "What the GAO found, and the 1997 follow-up",
        paras: [
          "The GAO's July 1995 report found four Army Air Forces accidents in New Mexico that July, all involving military aircraft and all after 8 July, and no 1947 requirement to report a weather balloon crash. RAAF administrative records for March 1945 to December 1949 and outgoing messages for October 1946 to December 1949 had been destroyed, with no record of who destroyed them, when or under what authority [8].",
          "In 1997 the Air Force published The Roswell Report: Case Closed. As summarised in AARO's 2024 historical review, it attributed the alleged alien bodies to test dummies carried aloft by high-altitude balloons, and claims of bodies at the base hospital to a conflation of a 1956 KC-97 accident that killed 11 airmen with a 1959 balloon mishap that injured two pilots [6]."
        ]
      }
    ],
    timeline: [
      {
        date: "1947-06-04",
        event: "Project Mogul Flight 4 is launched and is not recovered by the NYU group.",
        src: 5
      },
      {
        date: "1947-06-14",
        event: "W. W. Brazel and his son find wreckage on the ranch, by his account.",
        src: 2
      },
      {
        date: "1947-07-07",
        event: "Brazel goes to Roswell and contacts the sheriff.",
        src: 2
      },
      {
        date: "1947-07-08",
        event: "The RAAF information office reports the recovery of a \"flying disc\".",
        src: 7
      },
      {
        date: "1947-07-08",
        event: "FBI Dallas teletype describes a hexagonal disc and a balloon with a radar reflector.",
        src: 10
      },
      {
        date: "1947-07-09",
        event: "Press reports General Ramey's statement that the debris was a weather balloon.",
        src: 7
      },
      {
        date: "1994-05-24",
        event: "Sheridan Cavitt gives the Air Force a sworn statement.",
        src: 4
      },
      {
        date: "1995-07-28",
        event: "GAO reports its records search to Congressman Schiff.",
        src: 7
      }
    ],
    sources: [
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761379/-1/-1/0/REPORT_AF_ROSWELL.PDF",
        page: 1,
        note: "Air Force 1994 report: executive summary"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761379/-1/-1/0/REPORT_AF_ROSWELL.PDF",
        page: 4,
        note: "Air Force report: 1947 newspaper accounts"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761379/-1/-1/0/REPORT_AF_ROSWELL.PDF",
        page: 5,
        note: "Air Force report: revival from 1978"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761379/-1/-1/0/REPORT_AF_ROSWELL.PDF",
        page: 16,
        note: "Air Force report: Cavitt and Newton"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761379/-1/-1/0/REPORT_AF_ROSWELL.PDF",
        page: 19,
        note: "Air Force report: Mogul Flight 4"
      },
      {
        id: "AARO-AARO_Historical_Record_Report_Vol_1_2024.pdf",
        page: 22,
        note: "AARO 2024 review: 1997 report"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761373/-1/-1/0/GENERAL_ACCOUNTING_OFFICE_S_SCHIFF.PDF",
        page: 2,
        note: "GAO B-262046 letter: background"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761373/-1/-1/0/GENERAL_ACCOUNTING_OFFICE_S_SCHIFF.PDF",
        page: 3,
        note: "GAO report: results in brief"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761373/-1/-1/0/GENERAL_ACCOUNTING_OFFICE_S_SCHIFF.PDF",
        page: 5,
        note: "GAO report: 509th history, FBI teletype"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761373/-1/-1/0/GENERAL_ACCOUNTING_OFFICE_S_SCHIFF.PDF",
        page: 15,
        note: "FBI Dallas teletype, 8 July 1947"
      }
    ],
    updated: "2026-10-03"
  },
  kaikoura: {
    title: "Kaikoura 1978: what the RNZAF and DSIR files concluded",
    sections: [
      {
        heading: "Two nights, one investigation",
        paras: [
          "The RNZAF's own report sets out the basic facts. On the nights of 20/21 and 30/31 December 1978, Wellington air traffic control radar and the crews of Safe Air Argosy freighters, both visually and on the aircraft's radar, made many unidentified sightings off the east coast of the South Island [1]. The Civil Aviation Division of the Ministry of Transport told Air Staff about the first night mid-morning on 21 December. Defence had historically kept a 'low profile' on such reports, but because of the number and nature of that night's reports the Director of Civil Aviation specifically told his staff to inform it [1].",
          "Air Staff asked to be called if anything similar happened again, but the memo meant for the air traffic control centre was never delivered, so the events of 30/31 December reached Air Staff only the next day [1]. After heavy media coverage, the RNZAF decided to fly an Orion surveillance flight over the area on the night of 2/3 January 1979, and a Defence investigation began at the same time [1]. Witnesses were told it was not a judicial enquiry, and the credibility of their statements was taken at face value [1]."
        ]
      },
      {
        heading: "20/21 December: returns off the Clarence River",
        paras: [
          "On the first night, Wellington radar asked Argosy captains to look at returns it was painting in the Clarence River area [2]. The same radar also tracked a steady return that moved out from Wellington, stayed stationary for 35 minutes and then appeared to 'track' the second southbound Argosy at about 0328. Told of a strong return about 25 miles to port, the crew saw a very bright light they described as a bright orb, pear-shaped, with a reddish tinge that then turned white. It looked stationary to the eye but seemed to follow the aircraft on its radar, and the crew could not confirm that the light and the radar return were at the same range [2].",
          "Later, about 50 miles north-east of Christchurch, the captain saw five consecutive blips on the aircraft radar trace a path towards the aircraft over five seconds and veer sharply to port, while the co-pilot saw a flashing white light, like a strobe, follow the same path. The report worked out a speed of about 10,800 mph and suggested a meteor, or a 'double bounce' radar contact caused by ducting [3]. On the ground at RNZAF Base Woodbourne, the orderly officer saw three lights at 2350 that he first took for a Bristol Freighter [3]; the report judged it highly improbable that these lights and the radar returns were connected [4]."
        ],
        quote: {
          text: "This sighting, above all others during the night, caused the crew considerable consternation!",
          who: "RNZAF report on the 20/21 December flights",
          src: 3
        }
      },
      {
        heading: "30/31 December: the filmed flight",
        paras: [
          "At 11:46 pm on 30 December, Captain Bill Startup and co-pilot Robert Guard left Wellington on a newspaper delivery run to Christchurch. With them were Australian reporter Quentin Fogarty and a film crew, cameraman David Crockett and his wife Ngaire, who ran the tape recorder; a Melbourne TV station had commissioned them to film a story about the earlier sightings [9]. Crockett shot 16 mm colour film of the cabin, the lights of Kaikoura and bright objects seen ahead and to the right, while Wellington radar reported targets near the plane. The aircraft's own radar was not used on the way south [9].",
          "On the flight back north from Christchurch, the crew watched a light with 'the appearance of a squashed orange' that, measured against a thumb at arm's length, looked about two inches long [5]. Between 35 and 40 miles from Christchurch the captain turned towards it. The image on the aircraft radar moved to 10 miles away and then held the same position relative to the aircraft for a few minutes, before the light appeared to go above, behind and below the aircraft. Christchurch radar was working but reported nothing, and Wellington radar reported no unidentified contact in that area [5]."
        ]
      },
      {
        heading: "What the RNZAF concluded",
        paras: [
          "For the bright light of 20/21 December the report's answer was Venus, which was rising within a few minutes on the same bearing; DSIR experts said the conditions could have made it look large, bright and orange [2]. It found the 31 December light also consistent with an unusual view of Venus, although the sighting came at about 0225 and Venus did not rise until about 0328; DSIR advised that super refraction could make the planet visible earlier. It offered an atmospheric inversion layer for the light's apparent movement around the aircraft, and called the radar return probably spurious or a ship [5].",
          "The report also pointed to the radar and the sea. Wellington's radar had been giving anomalous returns for months, possibly after a recent modification that tilted its head down by one degree, and conditions favoured freak propagation of radio and light waves [2]. Some 50 Japanese squid boats had sailed from Wellington between 19 and 28 December on a track almost identical to one plotted by Wellington radar, each putting out about 200 kW of light when fishing [3]. The report acknowledged the crews' evident concern: they did not seem prepared to accept that they might have seen Venus, though neither did they believe they had seen a visitor from outer space [4]. Its final finding, signed by the Director of Operations, a wing commander, was that the few sightings still inconclusive might be explained once investigations were completed [6]."
        ],
        quote: {
          text: "Almost all the sightings can be explained by natural but unusual phenomena.",
          who: "Director of Operations, RNZAF report",
          src: 6
        }
      },
      {
        heading: "The scientists' view, and its limits",
        paras: [
          "DSIR's interim report reached a similar view. It found that most substantive sightings occurred from about 3 a.m., looking east and low on the horizon, and that these fit the rising of Venus but not the planet's normal appearance [7]. It put Startup's main sighting shortly after 0230, some 10 minutes before Venus should have risen at the aircraft's altitude, and called the description classic for a strongly refracted planet [7]. The RNZAF report's figures put the sighting about an hour before Venus rose; DSIR's put it about ten minutes before [5][7]. DSIR also saw little merit in analysing Crockett's 31 December film further, because the recorded image was almost entirely due to imperfections in the Argosy's window [7].",
          "On the night of 7/8 January a DSIR officer watched many unidentified returns at the Wellington control centre, while three ground parties on the Kaikoura coast, in radio contact with him, saw nothing to suggest they were anything other than known targets or spurious returns [8]. But DSIR listed two pieces of data that did not fit its pattern: the pulsating light that approached Captain Vern Powell's aircraft on 20/21 December with an on-board radar return, at an estimated 15,000 km per hour, and the large on-board radar signal on Startup's flight, indicating an object keeping station at about 16 km. It suggested meteorite showers for the first and an atmospheric mirror reflection for the second [8].",
          "Popular accounts often describe Kaikoura as officially unexplained; the file's reports instead attribute almost all of the sightings to Venus, ships' lights and spurious radar returns, while DSIR left two radar-linked observations outside that explanation [6][8]. An independent 1979 summary of the 30/31 December flights by Bruce Maccabee is also kept in the file [9]."
        ]
      },
      {
        heading: "The file",
        paras: [
          "The papers sit in Defence file AIR 1080/6/897, 'Investigations of Unidentified & Radar Sightings East Coast South Island – December 1978', opened in 1978 and closed in 1981 [10]. It holds RNZAF interviews with people involved, technical reports from DSIR and other scientific experts, and an independent report of the sightings by the NZ UFO Studies Centre. The NZDF declassified it in December 2010 for public release; access to the original file remains restricted until 2051 [10]."
        ]
      }
    ],
    timeline: [
      {
        date: "1978-12-21",
        event: "Wellington radar asks Argosy crews to check returns off the Clarence River; a crew reports a bright light their radar appears to track.",
        src: 2
      },
      {
        date: "1978-12-21",
        event: "Civil Aviation Division informs RNZAF Air Staff mid-morning.",
        src: 1
      },
      {
        date: "1978-12-30",
        event: "Startup's Argosy leaves Wellington at 11:46 pm with Quentin Fogarty and a film crew aboard.",
        src: 9
      },
      {
        date: "1978-12-31",
        event: "Flying north from Christchurch, the crew turn towards a large light at about 0225; Christchurch radar reports nothing.",
        src: 5
      },
      {
        date: "1979-01-02",
        event: "Night of 2/3 January: RNZAF Orion surveillance of the area; a Defence investigation is launched at that time.",
        src: 1
      },
      {
        date: "1979-01-08",
        event: "Night of 7/8 January: DSIR watches Wellington radar; Kaikoura coast ground parties see nothing to match returns.",
        src: 8
      },
      {
        date: "2010-12",
        event: "NZDF declassifies file AIR 1080/6/897 for public release.",
        src: 10
      }
    ],
    sources: [
      {
        url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf",
        page: 191,
        note: "RNZAF report: introduction"
      },
      {
        url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf",
        page: 193,
        note: "RNZAF report: radar, 21 Dec light, Venus"
      },
      {
        url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf",
        page: 194,
        note: "RNZAF report: squid fleet, radar blips"
      },
      {
        url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf",
        page: 195,
        note: "RNZAF report: 20/21 December summary"
      },
      {
        url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf",
        page: 197,
        note: "RNZAF report: 31 December flight north"
      },
      {
        url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf",
        page: 199,
        note: "RNZAF report: conclusions and signature"
      },
      {
        url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf",
        page: 135,
        note: "DSIR interim report: findings, Argosy film"
      },
      {
        url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf",
        page: 136,
        note: "DSIR interim report: radar, unexplained data"
      },
      {
        url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf",
        page: 19,
        note: "Maccabee 1979 summary of filmed flight"
      },
      {
        url: "https://github.com/hectorchanht/war-gov-ufo-release/releases/download/pdfs-v1/AIR-1080-6-897-Volume-1-1978-1981.pdf",
        page: 1,
        note: "NZDF release cover sheet"
      }
    ],
    updated: "2026-10-03"
  },
  "jal-1628": {
    title: "JAL 1628, 1986: a captain's account and the FAA's radar review",
    sections: [
      {
        heading: "Traffic where there should be none",
        paras: [
          "Japan Air Lines flight 1628, a Boeing 747 cargo flight from Iceland to Tokyo via Anchorage, crossed Alaska on the evening of 17 November 1986. FAA notes of interviews held that night at Anchorage record that Captain Kenju Terauchi and his crew reported unknown traffic accompanying them from the Alaska-Canada border along a route running roughly from Fort Yukon to Fairbanks and Anchorage [1].",
          "Anchorage Center's chronology begins at 0219 UTC, when the crew asked for traffic information. Told there was none, they replied that they had same-direction traffic about a mile ahead, apparently at their altitude, showing only white and yellow strobes. At 0225 they reported it on their own radar at 11 o'clock, 8 miles [2]."
        ]
      },
      {
        heading: "The captain's account",
        paras: [
          "In a written statement translated by the FAA and received on 2 January 1987, Terauchi wrote that about seven minutes after the crew began watching the lights, two objects stopped in front of the aircraft. The cockpit lit up and he felt warmth on his face. He described each as square, 500 to 1,000 feet ahead, about the size of a DC-8 fuselage, with numerous exhaust pipes, and wrote that the crew did not feel threatened or in danger [4].",
          "Later, over the lights of Fairbanks, he saw behind the aircraft what he called the silhouette of a gigantic spaceship, and asked for a 45-degree turn; the controller advised a 360-degree turn [5]. By his account the encounter ended about 150 miles from Anchorage, after approximately 50 minutes [6].",
          "The often-quoted size comes from an FAA interview on 2 January 1987, where the inspector, Richard Gordon, summarised Terauchi as saying the object was about two times as big as an aircraft carrier, and Terauchi agreed [7]. The FAA's alert report to the Administrator recorded that the crew could not determine a shape and estimated its size, from its yellow, amber and green lights, as equal to a 747 [8]."
        ],
        quote: {
          text: "most unexpectedly two spaceships stopped in front of our face, shooting off lights.",
          who: "Captain Kenju Terauchi, written statement translated by the FAA",
          src: 4
        }
      },
      {
        heading: "What the radar operators reported",
        paras: [
          "At 0226 the military Regional Operations Control Center (ROCC) reported a primary return at the flight's 10 o'clock, 8 miles, and a minute later had nothing. The crew called the traffic \"quite big\" at 0231 and descended from FL350 to FL310, saying it followed \"in formation\". Fairbanks Approach had no returns near the aircraft. At 0238 the ROCC reported a \"flight of two\" at the 747's position, one a primary target only; by 0242 it was no longer tracking. At 0245 controllers turned a northbound United Airlines flight toward the 747 [2].",
          "According to the alert report, the United flight and a military C-130 both reported nothing on visual checks, the military was telling the media its return was \"clutter\", and the crew were judged professional and rational [8]. On 18 December 1986 Anchorage Center forwarded its chronology; the Elmendorf ROCC was still checking its records [3]."
        ],
        quote: {
          text: "Radar data recorded by Anchorage Center does not confirm the presence of the traffic reported by Flight 1628.",
          who: "Air Traffic Manager, Anchorage ARTCC, 18 December 1986",
          src: 3
        }
      },
      {
        heading: "The FAA's conclusion",
        paras: [
          "On 5 March 1987 the FAA's Alaskan Region released its material, including transcripts, crew and controller interviews and radar plots, saying it was unable to confirm the event. It had pursued the case to learn whether an unreported aircraft posed a safety hazard. Experts at the FAA Technical Center reviewed the radar data and concluded that a second target near the flight was a split return from the 747 itself, an \"uncorrelated primary and beacon target return\" [9].",
          "A 25 February 1987 analysis of about 61 minutes of radar data found that 90 percent of beacon-only returns had a primary-only reply within an eighth of a mile, judged such returns not uncommon and called the flight's data normal. It explained that when an aircraft crosses into adjacent quarter-mile range cells, the timing of the radar and transponder replies is often off just enough to register two targets [10]. The FAA planned no further investigation, noting that Terauchi had reported another sighting in the same area on 11 January 1987 [9].",
          "Popular accounts often say FAA radar confirmed the object. The FAA's documents say its radar data did not, attributing the second target to a split return; the released file does not further explain the ROCC's intermittent primary returns [2][9]."
        ]
      }
    ],
    timeline: [
      {
        date: "1986-11-17",
        event: "Evening: JL1628 reports unknown traffic over Alaska; Anchorage's chronology starts at 0219 UTC.",
        src: 2
      },
      {
        date: "1986-11-17",
        event: "FAA officials interview the crew at Anchorage that night.",
        src: 1
      },
      {
        date: "1986-12-18",
        event: "Anchorage Center memo: its radar data do not confirm the traffic.",
        src: 3
      },
      {
        date: "1987-01-02",
        event: "FAA inspector Richard Gordon interviews Captain Terauchi.",
        src: 7
      },
      {
        date: "1987-02-25",
        event: "Anchorage Center analysis of uncorrelated radar targets.",
        src: 10
      },
      {
        date: "1987-03-05",
        event: "FAA releases its documents and says it cannot confirm the event.",
        src: 9
      }
    ],
    sources: [
      {
        url: "https://catalog.archives.gov/medialz/seattle/rg-237/733667/box_1/733667-001-024/733667-001-024.pdf",
        page: 1,
        note: "FAA notes of crew interviews, 17 Nov"
      },
      {
        url: "https://catalog.archives.gov/medialz/seattle/rg-237/733667/box_1/733667-001-012/733667-001-012.pdf",
        page: 3,
        note: "Anchorage Center chronology of events"
      },
      {
        url: "https://catalog.archives.gov/medialz/seattle/rg-237/733667/box_1/733667-001-012/733667-001-012.pdf",
        page: 2,
        note: "Anchorage Center memo, 18 December 1986"
      },
      {
        url: "https://catalog.archives.gov/medialz/seattle/rg-237/733667/box_1/733667-001-007/733667-001-007.pdf",
        page: 6,
        note: "Terauchi statement: two objects ahead"
      },
      {
        url: "https://catalog.archives.gov/medialz/seattle/rg-237/733667/box_1/733667-001-007/733667-001-007.pdf",
        page: 10,
        note: "Terauchi statement: large object, turns"
      },
      {
        url: "https://catalog.archives.gov/medialz/seattle/rg-237/733667/box_1/733667-001-007/733667-001-007.pdf",
        page: 13,
        note: "Terauchi statement: end, 50 minutes"
      },
      {
        url: "https://catalog.archives.gov/medialz/seattle/rg-237/733667/box_1/733667-001-008/733667-001-008.pdf",
        page: 11,
        note: "FAA interview of Terauchi, 2 Jan 1987"
      },
      {
        url: "https://catalog.archives.gov/medialz/seattle/rg-237/733667/box_1/733667-001-025/733667-001-025.pdf",
        page: 2,
        note: "FAA alert report to the Administrator"
      },
      {
        url: "https://catalog.archives.gov/medialz/seattle/rg-237/733667/box_1/733667-001-024/733667-001-024.pdf",
        page: 3,
        note: "FAA news release, 5 March 1987"
      },
      {
        url: "https://catalog.archives.gov/medialz/seattle/rg-237/733667/box_1/733667-001-023/733667-001-023.pdf",
        page: 4,
        note: "Anchorage Center split-target analysis"
      }
    ],
    updated: "2026-10-03"
  },
  tehran: {
    title: "Tehran 1976: two F-4 intercepts in a U.S. attaché's cable",
    sections: [
      {
        heading: "Calls to the command post",
        paras: [
          "The account that reached Washington is a cable from the U.S. Defense Attaché Office in Tehran. It reports that at about 12:30 a.m. on 19 September 1976 the Imperial Iranian Air Force (IIAF) command post received four calls from citizens in the Shemiran area of Tehran who had seen strange objects in the sky, some bird-like, others like a helicopter with a light on, although no helicopters were airborne [1].",
          "The command post called BG Yousefi, assistant deputy commander of operations. After telling a caller it was only stars and speaking to Mehrabad tower, he looked for himself, saw an object like a star but bigger and brighter, and scrambled an F-4 from Shahrokhi Air Force Base [1]."
        ]
      },
      {
        heading: "The first interceptor",
        paras: [
          "The F-4 took off at 0130 for a point about 40 nautical miles north of Tehran; the object was easily visible from 70 miles away. At 25 nautical miles the fighter lost all instrumentation and communications (UHF and intercom). The pilot broke off and headed back to Shahrokhi, and once he turned away the aircraft regained all instrumentation and communications [1]."
        ]
      },
      {
        heading: "The second interceptor",
        paras: [
          "A second F-4 launched at 0140. Its backseater acquired a radar lock at 27 nautical miles, 12 o'clock high; when the range fell to 25 nautical miles the object moved away and held that distance. Its light was described as flashing strobe lights in a rectangular pattern, alternating blue, green, red and orange so fast that all the colours could be seen at once [1].",
          "South of Tehran a second bright object, estimated at one half to one third the apparent size of the moon, came out of the first and headed straight for the F-4. The pilot tried to fire an AIM-9 missile, but his weapons control panel went off and he lost all communications. He turned and dived away; the object fell in trail at 3 to 4 nautical miles, then rejoined the primary object [1][2].",
          "A third object then headed straight down. With communications and weapons panel restored, the crew watched it apparently come to rest gently and cast a very bright light over 2 to 3 kilometres. Approaching Mehrabad they lost UHF and interphone each time they crossed a magnetic bearing of 150 degrees from the airport, and their inertial navigation fluctuated; a civil airliner had a communications failure in the same vicinity but saw nothing. The tower saw a cylinder-shaped object that passed over the F-4 only after the pilot told it where to look [2]."
        ],
        quote: {
          text: "The size of the radar return was comparable to that of a 707 tanker.",
          who: "U.S. Defense Attaché Office, Tehran, information report",
          src: 1
        }
      },
      {
        heading: "The search, and what is missing",
        paras: [
          "In daylight the crew were flown by helicopter to the spot, a dry lake bed, and noticed nothing. Circling west they picked up a beeper signal, loudest at a small house where the occupants spoke of a loud noise and a very bright light like lightning [2]. The cable says the aircraft and area were being checked for possible radiation, and that its information came from a source in conversation with a sub-source and an IIAF pilot of one of the F-4s [3].",
          "No follow-up report is in the released file. A later account by Captain Henry S. Shields of HQ USAFE said no additional information or explanation had been forthcoming [7], and that the results of the radiation checks and other tests had not been reported [8]."
        ]
      },
      {
        heading: "How the report travelled",
        paras: [
          "The attaché office sent the cable to the Defense Intelligence Agency on 23 September 1976, with the report dated 22 September; the Joint Chiefs of Staff message centre's distribution includes the Secretary of State, the CIA, the NSA and the White House [4]. Its originator line names Colonel Frank B. McKenzie, USAF, the Defense Attaché [1]. Popular accounts often credit the report to another officer and name both pilots; the released cable names neither pilot.",
          "A DIA evaluation graded the information as of high value and confirmed by other sources. Its remarks noted that the credibility of many witnesses was high, that visual sightings were confirmed by radar, and that some crew members lost night vision because of the object's brightness [5]. A DIA routing slip from Louis E. Foster, dated 8 December 1978 and marked \"Per telecon\", accompanies the evaluation and cable in the released file [6]. None of these documents offers an explanation for what was seen."
        ],
        quote: {
          text: "Similar electromagnetic effects (EME) were reported by three separate aircraft.",
          who: "DIA evaluation of the Tehran report",
          src: 5
        }
      }
    ],
    timeline: [
      {
        date: "1976-09-19",
        event: "About 12:30 a.m.: the IIAF command post receives four calls from Shemiran residents.",
        src: 1
      },
      {
        date: "1976-09-19",
        event: "0130: the first F-4 takes off and loses instruments and communications at 25 nautical miles.",
        src: 1
      },
      {
        date: "1976-09-19",
        event: "0140: the second F-4 launches and acquires a radar lock at 27 nautical miles.",
        src: 1
      },
      {
        date: "1976-09-19",
        event: "In daylight the crew are flown to a dry lake bed and trace a beeper signal to a house.",
        src: 2
      },
      {
        date: "1976-09-23",
        event: "The attaché office transmits its report, dated 22 September, to DIA.",
        src: 4
      },
      {
        date: "1978-12-08",
        event: "DIA routing slip marked \"Per telecon\" accompanies the evaluation and cable.",
        src: 6
      }
    ],
    sources: [
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761364/-1/-1/0/ROUTING_SLIP_UFO_IRAN.PDF",
        page: 4,
        note: "Attaché cable: calls and both F-4s"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761364/-1/-1/0/ROUTING_SLIP_UFO_IRAN.PDF",
        page: 5,
        note: "Attaché cable: third object, landing"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761364/-1/-1/0/ROUTING_SLIP_UFO_IRAN.PDF",
        page: 6,
        note: "Attaché cable: radiation check, sources"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761364/-1/-1/0/ROUTING_SLIP_UFO_IRAN.PDF",
        page: 3,
        note: "Cable header, distribution, report date"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761364/-1/-1/0/ROUTING_SLIP_UFO_IRAN.PDF",
        page: 2,
        note: "DIA evaluation of the report"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761364/-1/-1/0/ROUTING_SLIP_UFO_IRAN.PDF",
        page: 1,
        note: "DIA routing slip, 8 December 1978"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761355/-1/-1/0/NOW_YOU_SEE.PDF",
        page: 1,
        note: "Shields article: introduction"
      },
      {
        url: "https://media.defense.gov/2021/Jul/13/2002761355/-1/-1/0/NOW_YOU_SEE.PDF",
        page: 3,
        note: "Shields article: test results unreported"
      }
    ],
    updated: "2026-10-03"
  },
  socorro: {
    title: "Socorro 1964: one officer, four marks, no identified craft",
    sections: [
      {
        heading: "A chase abandoned",
        paras: [
          "The Air Force's own summary of the case begins at about 5:45 p.m. on 24 April 1964, roughly a mile south of Socorro, New Mexico. Police officer Lonnie Zamora was chasing a speeding car when he heard a roar and saw flames in an area where a dynamite shack was known to stand. Thinking it had exploded, he abandoned the chase, took a little-used road and had considerable difficulty getting his car up a gravel-covered hill [4].",
          "In the statement he gave the FBI, Zamora said he then noticed a shiny object 150 to 200 yards to the south, off the road, that at first looked like a car turned upside down. He saw two people in white coveralls very close to it; one seemed to turn, look straight at his car and jump, as if startled. He also noticed two \"legs\" slanting outward from the object to the ground, and said it was like aluminum, \"whitish against the mesa background, but not chrome\" [2]."
        ],
        quote: {
          text: "Saw two people in white coveralls very close to the object.",
          who: "Lonnie Zamora, statement recorded by the FBI",
          src: 2
        }
      },
      {
        heading: "Roar, flame and take-off",
        paras: [
          "According to the Air Force summary, Zamora radioed headquarters that he was going to check what he believed was a car accident, drove to a point about 150 feet from the gully and got out on foot. He described the object as white, egg or oval-shaped and apparently supported on girderlike legs. He then heard a roar and saw smoke and flame coming from its bottom. Believing it was about to explode, he ran to shelter behind his police car, bumping his leg and losing his glasses on the way [4].",
          "From cover, the summary says, he saw the object rise to about 15 to 20 feet, noted a red marking on it (a crescent with a vertical arrow and a horizontal line beneath) and watched it hold still for several seconds before flying off along the gully [4]. The documents do not agree on its direction: the summary says it went south, the project record card lists \"Stationary, SW or West\", and Hynek wrote in 1965 that it took off to the west [4][3][10].",
          "Popular retellings often have Zamora watching the craft's occupants; the Air Force summary states that he saw the figures only during his first glance, from about 800 feet, and did not see them again [4]. TSgt David Moody, who went to Socorro with Major Conner on 26 April, wrote that Zamora's description of the object was vague, with the red marking the only specific detail, and that Sergeant Chavez of the New Mexico State Police reached the scene about three minutes after the object disappeared [6]."
        ]
      },
      {
        heading: "What was left on the ground",
        paras: [
          "FBI Special Agent D. Arthur Byrnes, Jr. was on business at the State Police office in Socorro that afternoon. After 6:00 p.m. he went to the site, where Zamora, Undersheriff Jim Luckie, Sergeant M. S. Chavez and Officer Ted Jordan had gathered. He noted four indentations in the rough ground where Zamora described the object, and recorded that Zamora, whom he had known for about five years, was regarded as sober, industrious and conscientious [1].",
          "The Air Force summary adds that Chavez found slight depressions and apparently burned brush that was cold to the touch [4]. Moody recorded that local radar stations carried no unidentified tracks at the time and that the White Sands helicopters were at the other end of the range and not operating; he concluded that no cause could be determined by himself or Major Conner [6].",
          "Laboratory analysis reported in the summary found no foreign material or above-normal radiation in the soil samples, and no chemicals in the burned brush that would indicate a type of propellant [5]. Later claims that the site yielded exotic residue or radioactivity are not supported by these results."
        ],
        quote: {
          text: "Laboratory analysis of soil samples disclosed no foreign material or radiation above normal for the surrounding area.",
          who: "Air Force case summary, Project Blue Book file",
          src: 5
        }
      },
      {
        heading: "Hynek's assessment",
        paras: [
          "J. Allen Hynek flew to Albuquerque on Tuesday, 28 April 1964, at Captain Quintanilla's request, to meet Major Conner of Kirtland Air Force Base. By phone, Dr. LaPaz, who years earlier had worked with Zamora on a field trip in search of a fallen meteorite, told him Zamora was a completely reliable person. That evening Hynek spent about two hours with Zamora and Chavez at the Socorro jail [7].",
          "In his report Hynek recorded that Zamora had asked whether he should speak to the priest before saying anything, wrote that any question of hallucination seemed clearly out, and found that the site had been trampled so badly that he could not assess the burned areas. He expected that NICAP and APRO would treat Socorro as the best authenticated landing sighting on record, and urged the Air Force to spare no effort in establishing whether any military maneuvers had been taking place in the area [8]."
        ],
        quote: {
          text: "Zamora saw a tangible, physical object, under good daylight illumination, and from fairly close range",
          who: "J. Allen Hynek, report on his Socorro trip, 1964",
          src: 8
        }
      },
      {
        heading: "Explanations tried, and the file's verdict",
        paras: [
          "The project record card says the sighting was initially believed to be an observation of a lunar-module-type configuration, but that effort to date could not place a vehicle at the site. The card carries the case as UNIDENTIFIED pending additional data [3].",
          "Hynek went back to Socorro in March 1965 and used a critical letter from Menzel to re-examine the case. Zamora now denied having said anything about a flame when he first heard the explosion, though the Air Force summary of his account has him seeing flames at that moment [9][4]. Hynek agreed with Menzel that this part of the evidence was \"very mixed up\" and suggested some embroidery, either by Zamora or by Captain Holder, whose original report included it [9].",
          "Hynek rejected the idea that local teenagers who disliked Zamora had staged a hoax. LaPaz believed a hoax would have leaked by then, and a tourist passing through had separately reported a strange object; Hynek judged it entirely too big a hoax for high school students to perpetrate [10].",
          "No document in the file identifies what Zamora saw. The Air Force summary states that there was no evidence the object was extraterrestrial in origin or a threat to the security of the United States, and that the investigation was continuing [5]."
        ]
      }
    ],
    timeline: [
      {
        date: "1964-04-24",
        event: "About 5:45 p.m.: Zamora abandons a car chase to investigate a roar and flames south of Socorro.",
        src: 4
      },
      {
        date: "1964-04-24",
        event: "FBI agent D. Arthur Byrnes, Jr. reaches the site after 6:00 p.m. and notes four indentations.",
        src: 1
      },
      {
        date: "1964-04-26",
        event: "TSgt Moody and Major Conner visit Socorro; Moody reports that no cause could be determined.",
        src: 6
      },
      {
        date: "1964-04-28",
        event: "J. Allen Hynek arrives and interviews Zamora and Chavez that evening.",
        src: 7
      },
      {
        date: "1964-05-08",
        event: "FBI Albuquerque office dates its memorandum on the Socorro object.",
        src: 1
      },
      {
        date: "1965-03-12",
        event: "Hynek returns to Socorro and reviews the case against a critical letter from Menzel.",
        src: 9
      }
    ],
    sources: [
      {
        id: "65-hs1-834228961-62-hq-83894-serial-438",
        page: 2,
        note: "FBI Albuquerque memo: Byrnes at the site"
      },
      {
        id: "65-hs1-834228961-62-hq-83894-serial-438",
        page: 11,
        note: "Zamora's statement to the FBI"
      },
      {
        url: "https://catalog.archives.gov/id/302532129?objectPage=4",
        note: "Blue Book record card, Socorro"
      },
      {
        url: "https://catalog.archives.gov/id/302532129?objectPage=12",
        note: "Air Force case summary, page 1"
      },
      {
        url: "https://catalog.archives.gov/id/302532129?objectPage=11",
        note: "Air Force case summary, lab results"
      },
      {
        url: "https://catalog.archives.gov/id/302532129?objectPage=64",
        note: "TSgt Moody's report, 26 April 1964"
      },
      {
        url: "https://catalog.archives.gov/id/302532129?objectPage=65",
        note: "Hynek's trip report, 28 April 1964"
      },
      {
        url: "https://catalog.archives.gov/id/302532129?objectPage=69",
        note: "Hynek's trip report, conclusions"
      },
      {
        url: "https://catalog.archives.gov/id/302532129?objectPage=44",
        note: "Hynek's March 1965 return-trip report"
      },
      {
        url: "https://catalog.archives.gov/id/302532129?objectPage=47",
        note: "Hynek 1965 report on hoax theory"
      }
    ],
    updated: "2026-10-03"
  },
  "travis-walton": {
    title: "Travis Walton, 1975: what the polygraph records do and do not show",
    sections: [
      {
        heading: "A light beside a logging road",
        paras: [
          "No sheriff's office or Forest Service file on the case could be found for this review. The earliest detailed account is the one published in November 1975 by the Aerial Phenomena Research Organization (APRO), a Tucson UFO group that worked closely with the Walton family. According to APRO, at about 6:15 p.m. on 5 November 1975 Michael Rogers was driving his crew along a rough logging road in the Apache-Sitgreaves National Forest, about 15 miles south of Heber, Arizona. The men had been thinning trees under contract to the U.S. Forest Service; the crew was Rogers, 28, Travis Walton, 22, Ken Peterson, Duane Smith, Allen Dalis, John Goulette and Steve Pierce [1].",
          "APRO's field investigator reported that the men saw a glowing object about 15 feet across hovering silently 15 to 20 feet above a pile of slash, some 75 to 90 feet from the truck. Walton jumped out and walked toward it. The others said a narrow ray of greenish-blue light struck him and threw him backwards; terrified, they drove off, then went back within about 15 minutes and found neither Walton nor the object [2]."
        ]
      },
      {
        heading: "Search and suspicion",
        paras: [
          "APRO wrote that the crew notified Navajo County deputy sheriff Chuck Allison in Heber at 7:35 p.m., and that 40 to 50 men searched a radius of about two and a half miles the next day without result. The sheriff's office tested the site for radiation on 6 November and, a deputy said, found no significant readings above background; no landing marks or other physical traces were found [2][3]. The skeptic Philip Klass, writing in 1976, put the report more than two hours after the sighting and named the officer as Under-Sheriff L.C. Ellison [6].",
          "On 10 November, with Walton still missing, C. E. Gilson, a polygraph examiner with the Arizona Department of Public Safety, tested the six crewmen in Holbrook [2]. In his report to Sheriff Marlin Gillespie, as reprinted by APRO, Gilson said the purpose was to find out whether any of them was concealing an aggravated assault or homicide against Walton. Three of his four relevant questions dealt with injuring Walton or hiding his body; the fourth asked whether they had told the truth about seeing a UFO. He judged Goulette, Smith, Peterson, Rogers and Pierce truthful and called the sixth result inconclusive [5]; APRO identified that man as Dalis [2]."
        ],
        quote: {
          text: "These polygraph examinations prove that these five men did see some object that they believe to be a UFO and that Travis Walton was not injured or murdered by any of these men",
          who: "C. E. Gilson, Arizona Department of Public Safety, report to Sheriff Gillespie",
          src: 5
        }
      },
      {
        heading: "The return",
        paras: [
          "A few minutes after midnight on 11 November, Walton telephoned his sister's home from a booth at a Heber service station; his brother-in-law Grant Neff and brother Duane found him slumped on the floor of the booth [3]. As APRO reported his account, he woke on a table in a room with three hairless beings about five feet tall with large eyes, later met a man in blue clothing and a transparent helmet, lost consciousness when something like an oxygen mask was put over his face, and came to on a road near Heber as a disc-shaped craft rose above him [3].",
          "Duane took him to Phoenix that day [6]. APRO said two physicians examined him at its request and that blood and urine tests showed no evidence of drug use. Walton did not keep an appointment for a polygraph test; APRO blamed reporters camped at the family home and the test site [4]."
        ]
      },
      {
        heading: "Polygraph results that conflict",
        paras: [
          "In June 1976 Klass reported that Walton had taken an earlier test on 15 November 1975, given by John J. McCarthy of the Arizona Polygraph Laboratory, arranged by APRO's L.J. Lorenzen and paid for by the National Enquirer. Klass said he had examined McCarthy's consent form and his written report of 16 November, which found \"gross deception\" [6][7]. Klass noted that APRO's November bulletin, which covered that week, did not mention the test [7].",
          "On 7 February 1976 Walton and his brother took tests from George J. Pfeifer which, according to published reports, they passed [6]. Klass wrote that Pfeifer's employer, Tom Ezell, told him the Waltons had dictated the questions and that the charts would not be readable either way [9]. Gilson himself told Klass that his test had been meant to establish whether a crime had been committed, and that its single UFO question \"does not make it a valid test as far as verifying the UFO incident\" [8].",
          "The case is often summed up as one in which the crew passed lie-detector tests that confirmed an abduction. The records show a state test designed mainly to rule out a crime, one inconclusive result among the crew, and contradictory results for Walton himself."
        ],
        quote: {
          text: "attempting to perpetrate a UFO hoax, and that he has not been on any spacecraft.",
          who: "John J. McCarthy, report of 16 November 1975, as quoted by Philip Klass",
          src: 7
        }
      },
      {
        heading: "What the record supports",
        paras: [
          "Klass also argued that Rogers had a motive: his Forest Service thinning contract was behind schedule and due for completion on 10 November 1975 [8]. APRO, for its part, reported that Walton's account had not changed in any detail [4]. Every source used here comes from one of these two opposing camps; none is an official record. Together they show that Walton was reported missing on 5 November, was searched for, reappeared shortly after midnight on 11 November, and that a state examiner found five crewmen truthful on narrow questions. They do not establish what, if anything, the crew saw."
        ]
      }
    ],
    timeline: [
      {
        date: "1975-11-05",
        event: "About 6:15 p.m.: Rogers' crew reports a glowing object; Walton goes missing.",
        src: 1
      },
      {
        date: "1975-11-06",
        event: "About 40 to 50 searchers comb the area without finding Walton.",
        src: 2
      },
      {
        date: "1975-11-10",
        event: "C. E. Gilson polygraphs the six crewmen in Holbrook.",
        src: 5
      },
      {
        date: "1975-11-11",
        event: "Shortly after midnight, Walton calls his sister's home from a Heber phone booth.",
        src: 3
      },
      {
        date: "1975-11-15",
        event: "John J. McCarthy tests Walton and reports deception, according to Klass.",
        src: 7
      },
      {
        date: "1976-02-07",
        event: "George J. Pfeifer tests Travis and Duane Walton.",
        src: 6
      }
    ],
    sources: [
      {
        url: "https://archive.org/download/AFU_19751100_APRO_Bulletin_v24_n5/AFU_19751100_APRO_Bulletin_v24_n5.pdf",
        page: 1,
        note: "APRO Bulletin Nov 1975: crew and setting"
      },
      {
        url: "https://archive.org/download/AFU_19751100_APRO_Bulletin_v24_n5/AFU_19751100_APRO_Bulletin_v24_n5.pdf",
        page: 2,
        note: "APRO: sighting, report, search, polygraph"
      },
      {
        url: "https://archive.org/download/AFU_19751100_APRO_Bulletin_v24_n5/AFU_19751100_APRO_Bulletin_v24_n5.pdf",
        page: 3,
        note: "APRO: site check, return, Walton's account"
      },
      {
        url: "https://archive.org/download/AFU_19751100_APRO_Bulletin_v24_n5/AFU_19751100_APRO_Bulletin_v24_n5.pdf",
        page: 5,
        note: "APRO: medical tests, missed polygraph"
      },
      {
        url: "https://archive.org/download/AFU_19760300_APRO_Bulletin_v24_n9/AFU_19760300_APRO_Bulletin_v24_n9.pdf",
        page: 5,
        note: "Gilson's DPS report, reprinted by APRO"
      },
      {
        url: "https://archive.org/download/walton-abduction-cover-up-revealed/walton%20abduction%20cover-up%20revealed.pdf",
        page: 4,
        note: "Klass 1976: summary, McCarthy test arranged"
      },
      {
        url: "https://archive.org/download/walton-abduction-cover-up-revealed/walton%20abduction%20cover-up%20revealed.pdf",
        page: 5,
        note: "Klass: McCarthy result and report"
      },
      {
        url: "https://archive.org/download/walton-abduction-cover-up-revealed/walton%20abduction%20cover-up%20revealed.pdf",
        page: 10,
        note: "Klass: Gilson interview, contract deadline"
      },
      {
        url: "https://archive.org/download/walton-abduction-cover-up-revealed/walton%20abduction%20cover-up%20revealed.pdf",
        page: 6,
        note: "Klass: Ezell on Pfeifer test"
      }
    ],
    updated: "2026-10-03"
  },
  "shag-harbour": {
    title: "Shag Harbour 1967: lights on the water, a search by divers, no findings",
    sections: [
      {
        heading: "The first message",
        paras: [
          "The earliest document in the file is a priority \"UFO REPORT\" sent by the Rescue Co-ordination Centre (RCC) in Halifax to Canadian Forces Headquarters at 1320Z on 5 October 1967. It timed the sighting at 0210Z on 5 October, which is 11:10 p.m. on 4 October in Atlantic Daylight Time, on a clear night with no moon. The observer was listed as \"CPL WERCICKY RCMP BARRINGTON PASSAGE\" and the location as outside Lower Woods Harbour, Nova Scotia, with six other witnesses whose names were known to the corporal [1].",
          "It described a dark object in excess of 60 feet with four white lights spaced horizontally about 15 feet apart, moving easterly at low altitude, watched for more than five minutes. It said the object descended rapidly with a high whistling sound and made a bright flash on hitting the water, after which a single light floated on the surface for a long time and sank before the RCMP could get a boat to it [1].",
          "A Coast Guard lifeboat and many small boats had searched with nil results, other possible leads such as aircraft and flares had been checked, and Coast Guard Cutter 101 was heading out with the RCMP on board to search again [1]."
        ]
      },
      {
        heading: "Headquarters asks for a dive",
        paras: [
          "Canadian Forces Headquarters (CFHQ) replied the same day, asking Maritime Command to investigate and to consider an underwater search of the area as soon as possible [2].",
          "On 6 October Colonel W. W. Turner, CFHQ's Director of Operations, summarised the case in a memorandum headed \"UFO Report, Lower Wood Harbour NS\". He wrote that at 2345 hours local on 4 October the RCMP corporal from Barrington Passage and six other witnesses had sighted a large flying object, more than 60 feet in diameter and carrying four white lights, which within about five minutes flew down to the water surface, floated and sank. The RCC's preliminary investigation, he added, had discounted an aircraft, flares, floats or any other known objects [3].",
          "The two headquarters documents do not agree on the time: the RCC message's 0210Z corresponds to about 11:10 p.m. local time, while Turner's memo gives 11:45 p.m. [1][3]."
        ],
        quote: {
          text: "One light remained on the surface for considerable time but sank before a boat could reach it.",
          who: "Col. W. W. Turner, CFHQ memorandum, 6 October 1967",
          src: 3
        }
      },
      {
        heading: "Three days under water",
        paras: [
          "Late on 5 October Maritime Command ordered one diving officer and three men to investigate the object reported by the RCMP near 43°30'N 65°45'W, which it placed about 300 yards off shore. They were to meet Cutter 101 and the RCMP corporal at Clark's Harbour. The order went to the Atlantic diving command (CANCOMDIVELANT) and was copied to the station at Shelburne and to the ship Granby [4].",
          "On 6 October Maritime Command directed that the search area be expanded and searched thoroughly, approved hiring a local boat to continue the work and released Cutter 101 [5]. A situation report timed 0002Z on 8 October said two days of diving under good conditions had produced nil results over an area half a mile by one and a half miles, and that the search would end on 8 October if nothing was found [6].",
          "A final message the same evening recorded that the search had continued on 8 October with negative results and was terminated at 2130Z [7]."
        ]
      },
      {
        heading: "What the file concludes",
        paras: [
          "On 25 October Turner drafted an unclassified account for replying to a letter from a United States resident. It repeated that the object made a \"bright splash\" as it struck the water, that the corporal had tried to reach the floating white object before it sank, and that neither search found anything to explain it [8].",
          "A CFHQ review of 1967 UFO reports listed the case among sightings of interest. It stated that an investigation including an underwater search failed to locate any evidence which could be associated with a UFO, and was concluded without arriving at any fixed findings [9].",
          "Popular accounts describe a large patch of yellow foam on the water. None of the contemporaneous messages in this file mentions foam; Library and Archives Canada's own exhibit attributes the foam to the recollections of local fishermen, and notes that there is no trace of the RCMP's reports of the sighting in the files it holds [10]. No document in the file identifies the object."
        ],
        quote: {
          text: "An underwater search conducted by divers from the Department of National Defence also failed to locate any tangible evidence which could be used to arrive at an explainable conclusion.",
          who: "Col. W. W. Turner, CFHQ memorandum, 25 October 1967",
          src: 8
        }
      }
    ],
    timeline: [
      {
        date: "1967-10-04",
        event: "About 11:10 p.m. local (0210Z on 5 October): RCMP corporal and six witnesses see an object descend into the sea off Lower Woods Harbour.",
        src: 1
      },
      {
        date: "1967-10-05",
        event: "RCC Halifax reports to CFHQ; CFHQ asks Maritime Command to investigate and consider an underwater search.",
        src: 2
      },
      {
        date: "1967-10-06",
        event: "Col. Turner's memo records the diving team on scene with Coast Guard Cutter 101.",
        src: 3
      },
      {
        date: "1967-10-08",
        event: "Search continues with negative results and is terminated.",
        src: 7
      },
      {
        date: "1967-10-25",
        event: "Turner drafts an unclassified summary to answer a public enquiry.",
        src: 8
      }
    ],
    sources: [
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749390.jpg",
        note: "RCC Halifax UFO report message, 5 Oct"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749392.jpg",
        note: "CFHQ asks for underwater search"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749391.jpg",
        note: "Col. Turner memorandum, 6 October 1967"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749393.jpg",
        note: "Maritime Command diving order CUROPS 438"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749394.jpg",
        note: "CUROPS 451: search area expanded"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749397.jpg",
        note: "CUROPS 463: two days, nil results"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749398.jpg",
        note: "CUROPS 470: search terminated"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749401.jpg",
        note: "Col. Turner memorandum, 25 October 1967"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749812.jpg",
        note: "DND 1967 UFO review, p. 20"
      },
      {
        url: "https://web.archive.org/web/2012/http://www.collectionscanada.gc.ca/ufo/002029-1500.01-e.html",
        note: "LAC exhibit page on Shag Harbour"
      }
    ],
    updated: "2026-10-03"
  },
  "ohare-2006": {
    title: "O'Hare 2006: the tower tapes, the tower log and a disc no radar saw",
    sections: [
      {
        heading: "What the employees reported",
        paras: [
          "The sighting became public on 1 January 2007, when the Chicago Tribune reported that United Airlines employees said a saucer-like object had hovered low over O'Hare International Airport for several minutes on 7 November 2006 before bolting through thick clouds and leaving a hole in the overcast. The paper said as many as a dozen workers reported it to the airline, that it was first seen by a ramp worker directing a plane back from Gate C17, and that it happened in daylight at about 4:30 p.m. [1].",
          "According to the Tribune, all the witnesses described a dark gray, well-defined object, estimated at 6 to 24 feet across, with no lights and no sound, holding a fixed position just below the 1,900-foot cloud deck until it shot up into the clouds. The employees it interviewed spoke on condition of anonymity, and some said United officials had asked them to write reports and advised them not to talk about it [1].",
          "A United manager told the paper he ran outside his office in Concourse B after hearing the report on an internal airline radio frequency. The Tribune added that the pilots of the plane at Gate C17 were also told of the sighting, and that one of them reportedly opened a cockpit windscreen to get a better view of the object, which was estimated to be hovering 1,500 feet above the ground [1]."
        ],
        quote: {
          text: "It was like somebody punched a hole in the sky",
          who: "United Airlines employee, quoted in the Chicago Tribune",
          src: 1
        }
      },
      {
        heading: "The FAA's answer",
        paras: [
          "The Tribune reported that the FAA first said it had no information on a sighting, then reversed itself after the newspaper filed a Freedom of Information Act request: an internal review of tapes turned up a call from a United supervisor to an FAA manager in the tower. Spokeswoman Elizabeth Isham Cory said no controllers saw the object, a preliminary radar check found nothing out of the ordinary, and the FAA was not investigating further. Its theory, she said, was a \"weather phenomenon\" involving a low ceiling and airport lights shining into the clouds. A United spokeswoman said there was nothing in the airline's duty manager log [1]."
        ]
      },
      {
        heading: "What the released records contain",
        paras: [
          "The National Aviation Reporting Center on Anomalous Phenomena (NARCAP), a private group focused on aviation safety, obtained tower records through its own FOIA request and printed them in a May 2007 report. The FAA supplied three certified telephone recordings, all from United's ramp control, plus ground-control radio; the certifying technician stated that no other recordings involving the incident were found [5].",
          "In the first call, which NARCAP times at 4:30 p.m., Sue in the United tower asked a supervisor named Dave whether he had seen a flying disc out by C17; he laughed and said he had not. Two more calls from United followed at about 4:47 and 4:52 p.m. [3]. The tower's Daily Record of Facility Operation logs Sue's inquiry at 2245 UTC (4:45 p.m.) with the reply that the tower had not seen it, and records the matter closed at 2303 UTC [2].",
          "The inbound ground-control tape raises a timing question. At a point NARCAP times at 3:58:09 p.m., the controller told a Gateway flight to \"use caution for the, ah UFO\" [4]. At about 4:48 p.m. a caller identifying himself as United taxi mechanics told the controller, \"Oh, we saw it a half hour ago,\" adding that they thought it was a balloon but were not sure [6]. NARCAP noted that the 3:58 remark comes earlier than the witnesses' own timings and could not resolve the difference [8]."
        ]
      },
      {
        heading: "Radar and the hole in the clouds",
        paras: [
          "NARCAP's analysts reviewed FAA radar data and found no primary returns within a mile of Gate C17 at the time of the sighting [7]. The group argued that the lack of a radar return did not mean nothing was there [7], and its cloud analysis rejected a natural precipitation process as the cause of the hole, concluding that it could not be explained by conventional weather or aircraft [9]. These are the views of a private research group; the FAA made no such finding and did not investigate.",
          "Retellings sometimes say the tower tapes or radar captured the object. The released FAA material consists of phone calls and controller remarks about a reported disc, and neither the FAA nor NARCAP found it on radar. The object was never identified, and the only official explanation offered, the FAA's weather theory, was given without an investigation [1][7]."
        ]
      }
    ],
    timeline: [
      {
        date: "2006-11-07",
        event: "At a point timed 3:58 p.m., the ground controller warns a flight to use caution for a UFO.",
        src: 4
      },
      {
        date: "2006-11-07",
        event: "4:30 p.m.: United ramp control asks the FAA tower about a disc over Gate C17.",
        src: 3
      },
      {
        date: "2006-11-07",
        event: "2245 UTC (4:45 p.m.): the tower log records the inquiry; the item is closed at 2303 UTC.",
        src: 2
      },
      {
        date: "2007-01-01",
        event: "The Chicago Tribune publishes the sighting and the FAA's weather explanation.",
        src: 1
      },
      {
        date: "2007-03-05",
        event: "NARCAP receives the FAA's certified recordings under FOIA.",
        src: 5
      }
    ],
    sources: [
      {
        url: "https://www.chicagotribune.com/2007/01/01/in-the-sky-a-bird-a-plane-a-ufo/",
        note: "Chicago Tribune, Hilkevitch, 1 Jan 2007"
      },
      {
        url: "https://www.narcap.org/s/NARCAP_TR-10.pdf",
        page: 22,
        note: "FAA tower Daily Record of Facility Operation"
      },
      {
        url: "https://www.narcap.org/s/NARCAP_TR-10.pdf",
        page: 28,
        note: "FAA recordings diagram; 4:30 p.m. call"
      },
      {
        url: "https://www.narcap.org/s/NARCAP_TR-10.pdf",
        page: 32,
        note: "Ground-control tape, 3:58 UFO remark"
      },
      {
        url: "https://www.narcap.org/s/NARCAP_TR-10.pdf",
        page: 27,
        note: "FAA FOIA package and certification"
      },
      {
        url: "https://www.narcap.org/s/NARCAP_TR-10.pdf",
        page: 34,
        note: "Ground-control tape, 4:47-4:48 p.m."
      },
      {
        url: "https://www.narcap.org/s/NARCAP_TR-10.pdf",
        page: 72,
        note: "NARCAP: no radar returns near C17"
      },
      {
        url: "https://www.narcap.org/s/NARCAP_TR-10.pdf",
        page: 15,
        note: "NARCAP on the timing discrepancy"
      },
      {
        url: "https://www.narcap.org/s/NARCAP_TR-10.pdf",
        page: 47,
        note: "NARCAP hole-in-cloud conclusion"
      }
    ],
    updated: "2026-10-03"
  },
  stephenville: {
    title: "Stephenville 2008: witness reports, an Air Force correction and a radar study",
    sections: [
      {
        heading: "Lights over Erath County",
        paras: [
          "On 14 January 2008 the Associated Press reported that several dozen people around Stephenville, Texas, including a pilot, a county constable and business owners, said they had seen a large, silent object with bright lights flying low and fast; some said fighter jets were chasing it. Most of the sightings were reported for the night of 8 January [1].",
          "Steve Allen, a freight company owner and pilot, told the AP that the object he saw was a mile long and half a mile wide. Erath County Constable Lee Roy Gaitan said he first saw red glowing lights and then white flashing lights moving fast, but could not see what they were attached to, even with binoculars. Machinist Ricky Sorrells described a flat, metallic object hovering about 300 feet over a pasture behind his home in Dublin, which he said he had seen several times; the report does not tie his sighting to 8 January [1]."
        ],
        quote: {
          text: "I didn't see a flying saucer and I don't know what it was, but it wasn't an airplane",
          who: "Constable Lee Roy Gaitan, to the Associated Press",
          src: 1
        }
      },
      {
        heading: "From \"no aircraft\" to ten F-16s",
        paras: [
          "In the same AP report, Maj. Karl Lewis, a spokesman for the 301st Fighter Wing at the Joint Reserve Base Naval Air Station in Fort Worth, said no F-16s or other aircraft from his base were in the area that night and suggested the lights were airliners catching the setting sun. Officials at Dyess and Sheppard Air Force Bases also said none of their aircraft were there [1].",
          "On 23 January, CNN reported, an Air Force Reserve news release said an error had been made: ten F-16s from the 457th Fighter Squadron had been on a training mission in the Brownwood Military Operating Area between 6 and 8 p.m. on 8 January. Lewis attributed the mistake to an internal communications problem between offices at the base, and the release named the jets as the cause of the lights [2]."
        ],
        quote: {
          text: "In the interest of public awareness, Air Force Reserve Command Public Affairs realized an error was made regarding the reported training activity of military aircraft",
          who: "Air Force Reserve news release, 23 January 2008, as quoted by CNN",
          src: 2
        }
      },
      {
        heading: "The FOIA radar study",
        paras: [
          "Radar engineer Glen Schulze and Robert Powell, the Mutual UFO Network's director of research, sent Freedom of Information Act requests to the FAA and to military bases. The FAA's Fort Worth Air Route Traffic Control Center answered on 19 February 2008 with a CD of radar data [7], which the authors describe as about 2.8 million returns from five radar sites covering 4 to 8 p.m. [3]. The base released a logbook of the 457th Fighter Squadron that was mostly blacked out [3], and told Powell that the jets' onboard recording cartridges from 8 January had been overwritten [8].",
          "In their MUFON report the authors traced ten jets from the Fort Worth base through the area in sorties of four, four and two, with only the lead aircraft using transponders, at about 15,000 to 17,000 feet over Stephenville [4]. They worked from 17 witness reports, withheld the witnesses' names for privacy, and credited Stephenville Empire-Tribune reporter Angelia Joiner with bringing many of them forward [10].",
          "They also described returns without transponders near the witnesses' lines of sight: two detections after 6:15 p.m. which, if they were the same object, implied about 2,100 mph [4][5]; a slow target tracked for more than an hour on a course toward President Bush's Crawford ranch, 10 miles away when the data ended at 8 p.m.; and a return moving north at 1,900 mph at 7:26 p.m. [5]."
        ]
      },
      {
        heading: "What the data can and cannot show",
        paras: [
          "The authors concluded that a real, physical object was present and that it was not any known aircraft. They also acknowledged that each high-speed return could have been a coincidental radar hit [6]. FAA primary radar does not measure an object's size [3], and the report notes that the nearest FAA antennas were not expected to see anything below about 2,700 feet near Stephenville because of the curvature of the earth [9].",
          "Popular accounts often say FAA radar confirmed a giant craft. The FOIA data contain no size information, and much of the low-level flight that witnesses described would have been below the nearest antennas' coverage, so the links between radar returns and sightings rest on the MUFON authors' matching of times and directions.",
          "No government body investigated the sightings; the AP noted that the Air Force no longer investigates UFOs [1]. The Air Force Reserve's training-flight explanation and the MUFON radar study remain the two documented positions on what was seen over Erath County [2][6]."
        ]
      }
    ],
    timeline: [
      {
        date: "2008-01-08",
        event: "Evening: residents around Stephenville and Dublin report bright, silent lights.",
        src: 1
      },
      {
        date: "2008-01-14",
        event: "AP reports the sightings; the 301st Fighter Wing says none of its aircraft were in the area.",
        src: 1
      },
      {
        date: "2008-01-23",
        event: "An Air Force Reserve release says ten F-16s were training nearby that evening.",
        src: 2
      },
      {
        date: "2008-02-19",
        event: "The FAA sends Fort Worth Center radar data in reply to Schulze's FOIA request.",
        src: 7
      },
      {
        date: "2008-03-27",
        event: "The 10th Air Force tells Powell the jets' recording files were overwritten.",
        src: 8
      }
    ],
    sources: [
      {
        url: "https://www.nbcnews.com/id/wbna22656172",
        note: "AP, Angela K. Brown, 14 Jan 2008"
      },
      {
        url: "https://edition.cnn.com/2008/US/01/23/airforce.ufo/index.html",
        note: "CNN, 23 Jan 2008: Air Force correction"
      },
      {
        url: "https://zenodo.org/records/10530422/files/Dublin%20Stephenville%20Radar%20Report%20prime%202.pdf",
        page: 5,
        note: "MUFON radar report: FOIA data, logbook"
      },
      {
        url: "https://zenodo.org/records/10530422/files/Dublin%20Stephenville%20Radar%20Report%20prime%202.pdf",
        page: 6,
        note: "MUFON: ten jets, transponder use"
      },
      {
        url: "https://zenodo.org/records/10530422/files/Dublin%20Stephenville%20Radar%20Report%20prime%202.pdf",
        page: 7,
        note: "MUFON: unknown radar tracks"
      },
      {
        url: "https://zenodo.org/records/10530422/files/Dublin%20Stephenville%20Radar%20Report%20prime%202.pdf",
        page: 47,
        note: "MUFON report conclusions"
      },
      {
        url: "https://zenodo.org/records/10530422/files/Dublin%20Stephenville%20Radar%20Report%20prime%202.pdf",
        page: 75,
        note: "FAA FOIA reply letter, 19 Feb 2008"
      },
      {
        url: "https://zenodo.org/records/10530422/files/Dublin%20Stephenville%20Radar%20Report%20prime%202.pdf",
        page: 67,
        note: "Air Force FOIA reply, 27 Mar 2008"
      },
      {
        url: "https://zenodo.org/records/10530422/files/Dublin%20Stephenville%20Radar%20Report%20prime%202.pdf",
        page: 11,
        note: "MUFON: FAA radar low-altitude limit"
      },
      {
        url: "https://zenodo.org/records/10530422/files/Dublin%20Stephenville%20Radar%20Report%20prime%202.pdf",
        page: 31,
        note: "MUFON: witness reports, names withheld"
      }
    ],
    updated: "2026-10-03"
  },
  "trans-en-provence": {
    title: "Trans-en-Provence 1981: a ground trace GEPAN could not explain",
    sections: [
      {
        heading: "An object on the terrace",
        paras: [
          "GEIPAN's case file 1981-01-00849 records that on 8 January 1981 a man was working on the upper terrace of his property near Trans-en-Provence, in the Var, building a small masonry shelter for a pump. A whistling sound drew his attention, and he saw a craft come down, settle a few dozen metres below him and leave again after a few seconds on a vertical path, disappearing at high speed [1].",
          "His statement to the gendarmerie the next day, reproduced in GEPAN Technical Note no. 16, puts the time at about 5 p.m. Out of work since his employer closed in November 1979, he drew an invalidity pension after heart trouble in 1973. He heard only a slight whistle, saw no flames, and from the terrace above saw the craft on the ground. It rose at once and left north-east over the trees. He put himself about thirty metres away, and afterwards found a circle about two metres across with what looked like skid marks on its edge [3].",
          "He said it was shaped like two plates turned over against each other, about 1.5 metres high and the colour of lead, and that as it lifted he saw four openings underneath, emitting neither flame nor smoke [3]. The GEPAN note refers to him only as \"M. Colini\" and codes the local place names as A1 and A2 [4]."
        ],
        quote: {
          text: "l'engin avait la forme de deux assiettes renversées, l'une contre l'autre",
          who: "The witness, gendarmerie statement of 9 January 1981",
          src: 3
        }
      },
      {
        heading: "Gendarmes, rain and a 40-day delay",
        paras: [
          "Alerted by the neighbours, gendarmes reached the property at about 11:30 a.m. on 9 January, questioned the witness, photographed the marks and took samples. GEPAN, the unit of the space agency CNES that handled such reports, learned of the case on 12 January. After heavy weekend rain it chose not to go immediately, asking instead that the samples reach laboratories quickly [2].",
          "The gendarmes' first description of the mark was precise: two concentric circles 2.20 and 2.40 metres in diameter, enclosing a ring about 10 centimetres wide, with two diametrically opposite sections showing black streaks like skid marks [4]. GEPAN investigators arrived on 17 February, 40 days after the event. The trace was still visible as lighter arcs on the ground, where the soil was strongly compacted into a crust about a centimetre thick [4].",
          "GEIPAN gives the sighting as 30 to 40 seconds and the object as about 2.5 metres across and 1.70 metres high, grey like zinc [1]. GEPAN found nothing in the witness's statements or behaviour suggesting invention or exaggeration, but added that this was not enough to certify his testimony [8]."
        ]
      },
      {
        heading: "Checks on aircraft and military activity",
        paras: [
          "Army aviation found only one flight over the area that day, an Alouette II helicopter at about 200 metres around 4:30 p.m. [5].",
          "At one of France's largest military training areas, to the north, the only notable activity at the time was short-range firing of inert tank shells more than 25 kilometres away [5]."
        ]
      },
      {
        heading: "What the soil showed",
        paras: [
          "The soil samples were sent to four different laboratories, each using different techniques [1]. GEPAN's synthesis of their results lists strong mechanical pressure at the surface, probably from an impact; changes to the surface structure in the form of streaks and erosion; heating of the ground that did not exceed 600 degrees; and possibly small deposits of material, including traces of iron or iron oxide on limestone grains and small amounts of phosphate and zinc [6].",
          "The note's own conclusion was cautious. It said the terrain made a precise quantitative estimate of mass, pressure or heating almost impossible, and that the possible interpretations, such as impact or friction, were too varied and vague to count as definitive confirmation of the witness's account [8]. Popular accounts that GEPAN calculated the object's weight at several tonnes are not supported by the note, which gives no mass figure."
        ]
      },
      {
        heading: "The alfalfa study and the verdict",
        paras: [
          "Plant analysis was done by Dr Bounias of the INRA biochemistry laboratory at Avignon-Montfavet, who wrote that part of the note in March 1983. He studied wild alfalfa (Medicago minima) taken on 9 January, as a control 20 metres away on 23 January, and on 17 February [7].",
          "Bounias reported that leaves from plants nearest the trace still showed, 40 days later, a 30 to 50 per cent weakening of their chlorophyll and carotenoid pigments, with the largest losses in young leaves. In most cases the changes correlated with distance from the centre [9]. GEIPAN's summary adds that the causes of the damage were not determined, though the hypothesis of an intense electric field could be considered [1].",
          "GEPAN concluded that the physical analyses showed, qualitatively, an event of some magnitude that had caused mechanical deformation, heating and perhaps trace deposits of material, and that the plant results were a further confirmation of such an event. Whether this matched the witness's description remained open, and interpretations would stay vague without systematic studies [8]. The later COMETA report, UFOs and Defense: What Should We Prepare For?, went further, saying in its introduction that in-depth studies of the case had shown \"that something did in fact land on the ground\" [10]. GEIPAN keeps the case in class D, unidentified: an unusual phenomenon whose origin the investigation could not determine [1]."
        ],
        quote: {
          text: "Il a été toutefois possible de montrer qualitativement l'occurrence d'un évènement de grande ampleur ayant entraîné des déformations mécaniques, un échauffement, et peut être certains apports de matériaux en trace.",
          who: "GEPAN Technical Note no. 16, synthesis and conclusions, 1983",
          src: 8
        }
      }
    ],
    timeline: [
      {
        date: "1981-01-08",
        event: "About 5 p.m.: the witness reports a craft landing briefly on his terrace and leaving a circular mark.",
        src: 3
      },
      {
        date: "1981-01-09",
        event: "Gendarmes question the witness, photograph the trace and take soil and plant samples.",
        src: 2
      },
      {
        date: "1981-01-12",
        event: "GEPAN learns of the case; after heavy weekend rain it defers a site visit.",
        src: 2
      },
      {
        date: "1981-01-23",
        event: "Gendarmes take control alfalfa samples 20 metres from the trace.",
        src: 7
      },
      {
        date: "1981-02-17",
        event: "Forty days on, GEPAN investigators find the trace still visible.",
        src: 4
      },
      {
        date: "1983-03-01",
        event: "GEPAN issues Technical Note no. 16, Enquête 81/01: analyse d'une trace, at Toulouse."
      }
    ],
    sources: [
      {
        url: "https://www.cnes-geipan.fr/fr/cas/1981-01-00849",
        note: "GEIPAN case 1981-01-00849, class D"
      },
      {
        url: "https://web.archive.org/web/20090628070143/http://www.cnes-geipan.fr/documents/nt16_enquete_81_01.pdf",
        page: 5,
        note: "GEPAN Technical Note 16: case presentation"
      },
      {
        url: "https://web.archive.org/web/20090628070143/http://www.cnes-geipan.fr/documents/nt16_enquete_81_01.pdf",
        page: 17,
        note: "Gendarmerie statement of 9 January 1981"
      },
      {
        url: "https://web.archive.org/web/20090628070143/http://www.cnes-geipan.fr/documents/nt16_enquete_81_01.pdf",
        page: 28,
        note: "Description of the ground trace"
      },
      {
        url: "https://web.archive.org/web/20090628070143/http://www.cnes-geipan.fr/documents/nt16_enquete_81_01.pdf",
        page: 34,
        note: "Air traffic and military activity checks"
      },
      {
        url: "https://web.archive.org/web/20090628070143/http://www.cnes-geipan.fr/documents/nt16_enquete_81_01.pdf",
        page: 40,
        note: "Synthesis of the soil analyses"
      },
      {
        url: "https://web.archive.org/web/20090628070143/http://www.cnes-geipan.fr/documents/nt16_enquete_81_01.pdf",
        page: 42,
        note: "Bounias (INRA): plant sampling"
      },
      {
        url: "https://web.archive.org/web/20090628070143/http://www.cnes-geipan.fr/documents/nt16_enquete_81_01.pdf",
        page: 66,
        note: "GEPAN synthesis and conclusions"
      },
      {
        url: "https://web.archive.org/web/20090628070143/http://www.cnes-geipan.fr/documents/nt16_enquete_81_01.pdf",
        page: 64,
        note: "Bounias (INRA): plant results"
      },
      {
        id: "255413270UFOsandDefenseWhatShouldwePrepareFor",
        page: 12,
        note: "COMETA report, introduction"
      }
    ],
    updated: "2026-10-03"
  },
  manises: {
    title: "Manises 1979: what the Spanish Air Force file records",
    sections: [
      {
        heading: "A signal on the emergency frequency",
        paras: [
          "The Spanish Air Force file on the Manises incident is numbered 791111 and is bound with two later cases from the same month, 791117 and 791128 [2]. It opens with a summary written by the Intelligence Section of the Air Operations Command (Mando Operativo Aéreo). All times in it are given in Zulu, or UTC [3].",
          "According to that summary, at 20:27Z on 11 November 1979 search-and-rescue in Madrid told Valencia tower of a signal on 121.5, the aviation emergency frequency, about 40 nautical miles north-east of Valencia. The tower and three aircraft could not hear it, though the pilot of IB 231 said he had heard it earlier [3].",
          "At 22:02Z Barcelona Control asked flight JK 297 of the airline TAE, flying from Palma to Tenerife, whether it could hear an emergency signal on 121.5. The crew confirmed that they could hear it but could not identify it [3]."
        ]
      },
      {
        heading: "Two red lights and a diversion",
        paras: [
          "At 22:05Z, the summary continues, the JK 297 crew told Control that they had in sight, at their ten o'clock and at their level, two intense red lights. They assumed these belonged to converging traffic three to five miles away, though they could see no anti-collision light. The airliner was then 15 nautical miles south of Ibiza, climbing from flight level 230 to 330 [3].",
          "The summary states plainly that the crew never saw an object. Because the lights were close and the crew feared a collision with what they took to be a large object, they decided to leave their route and land at Valencia. At 22:24Z, cleared to proceed to Valencia at 4,000 feet, they reported that they had lost sight of the red lights and, at the same moment, stopped hearing the 121.5 signal. The aircraft landed at 22:45Z [3]."
        ],
        quote: {
          text: "La tripulación no vio en ningún momento objeto alguno",
          who: "Air Operations Command summary, Manises file",
          src: 3
        }
      },
      {
        heading: "Lights over the airport and an interceptor",
        paras: [
          "Told the airliner was coming in, airport duty staff went outside and saw three unusually bright lights in the sky [3]. One, to the east-south-east over the port of Valencia and about 20 degrees above the horizon, seemed stationary and flashed green, red and white. The summary adds that it was later found to follow the movement of the sky quite faithfully [4].",
          "A fighter scrambled from Albacete air base made contact with Pegaso, the air-defence control centre, at 23:42Z. From the conversation between the pilot and Pegaso, the summary says, the aircraft made no appreciable progress towards the lights it was observing, and it returned to base, signing off at 00:57Z. Neither the fighter nor Pegaso made radar contact with any object, although there was radio interference and the aircraft's warning system registered some lock-ons [4].",
          "Two controllers said that through binoculars they saw jet-like navigation lights between El Saler and La Albufera moving south at 2,500 to 3,000 feet; the interceptor was elsewhere at the time, so they were not its lights [4].",
          "Popular accounts often say that the objects were tracked on radar that night or that the fighter locked on to them. The summary records no radar contact on 11 November [4]; the lock-on it describes, which broke instantly, came during the separate Madrid alert of 28 November [5]."
        ],
        quote: {
          text: "No hubo contacto radar con objeto alguno ni por parte del avión ni por parte de Pegaso",
          who: "Air Operations Command summary, Manises file",
          src: 4
        }
      },
      {
        heading: "Two later alerts in the same file",
        paras: [
          "On 17 November a fighter from Albacete chased an intermittent unknown radar track, then saw three lights in a triangle that it could not close on in ten minutes at Mach 0.95; on the way back its pilot heard children's voices on the radio for about 30 seconds [4].",
          "On 28 November an observatory in Madrid reported two strange objects overhead and a radar station showed three stationary high-altitude echoes [4]. An interceptor from Torrejón saw nothing but obtained four radar contacts, once with a lock-on that broke instantly; when Pegaso placed an object just ahead of an airliner, the pilot saw only the airliner [5]."
        ]
      },
      {
        heading: "How the file was opened and released",
        paras: [
          "The document index that follows the summary shows how the inquiry began. A teletype sent at 08:10Z on 12 November by the head of the Valencia air sector reported that a TAE aircraft on a Palma-Tenerife flight plan had landed at Valencia because of the dangerously close presence of an unidentified object. The same day the general commanding Air Transport Command ordered the colonel in charge of the Valencia air sector to open an information file, and the regional air commander reported the incident and the order to the Chief of the Air Staff [5].",
          "Barcelona control's log and tape transcript, forwarded on 13 November, were later included in the report of the investigating officer, the Juez Informador [5].",
          "Stamps on the summary show it was declassified on 11 August 1994 and logged by the Air Force's central library on 1 September 1994 [3]. The Ministry of Defence's virtual library now holds the file, catalogued as covering 1979 to 1994 and distributed under a CC BY 4.0 licence [1]. This account rests on the opening summary and index; the investigating officer's full report appears later in the file."
        ]
      }
    ],
    timeline: [
      {
        date: "1979-11-11",
        event: "20:27Z: Madrid search-and-rescue reports a signal on the 121.5 emergency frequency north-east of Valencia.",
        src: 3
      },
      {
        date: "1979-11-11",
        event: "22:05Z: JK 297 reports two intense red lights south of Ibiza and diverts; it lands at Valencia at 22:45Z.",
        src: 3
      },
      {
        date: "1979-11-11",
        event: "23:42Z: a fighter from Albacete contacts Pegaso; no radar contact is made and it signs off at 00:57Z.",
        src: 4
      },
      {
        date: "1979-11-12",
        event: "An information file is ordered on the incident at Valencia.",
        src: 5
      },
      {
        date: "1979-11-17",
        event: "A scrambled fighter reports three lights in a triangle it cannot close on.",
        src: 4
      },
      {
        date: "1979-11-28",
        event: "A Torrejón interceptor gets radar contacts over Madrid but sees no object.",
        src: 5
      },
      {
        date: "1994-08-11",
        event: "The file's summary is stamped declassified.",
        src: 3
      }
    ],
    sources: [
      {
        url: "https://bibliotecavirtual.defensa.gob.es/BVMDefensa/exp_ovni/es/consulta/registro.do?id=38290",
        note: "Defence Virtual Library catalogue record"
      },
      {
        url: "https://bibliotecavirtual.defensa.gob.es/BVMDefensa/exp_ovni/es/catalogo_imagenes/imagen.do?path=102241&posicion=1&registrardownload=1",
        page: 1,
        note: "File cover: case numbers and dates"
      },
      {
        url: "https://bibliotecavirtual.defensa.gob.es/BVMDefensa/exp_ovni/es/catalogo_imagenes/imagen.do?path=102241&posicion=1&registrardownload=1",
        page: 2,
        note: "Air Operations Command summary, page 1"
      },
      {
        url: "https://bibliotecavirtual.defensa.gob.es/BVMDefensa/exp_ovni/es/catalogo_imagenes/imagen.do?path=102241&posicion=1&registrardownload=1",
        page: 3,
        note: "Air Operations Command summary, page 2"
      },
      {
        url: "https://bibliotecavirtual.defensa.gob.es/BVMDefensa/exp_ovni/es/catalogo_imagenes/imagen.do?path=102241&posicion=1&registrardownload=1",
        page: 4,
        note: "Summary, page 3, and document index"
      }
    ],
    updated: "2026-10-03"
  },
  "falcon-lake": {
    title: "Falcon Lake 1967: burns, radium and an unexplained landing report",
    sections: [
      {
        heading: "The first report",
        paras: [
          "On 23 May 1967 the Rescue Co-ordination Centre in Winnipeg sent Canadian Forces Headquarters a UFO report from \"MR S MICHALAK\" of Winnipeg about an event on 20 May at Falcon Lake, Manitoba. It described two saucer-shaped objects on the ground, 35 to 40 feet across, the colour of unpolished steel and changing to a heated-metal colour on departure [1].",
          "According to the message, Michalak watched them for half an hour, saw one depart vertically, and went up to the other, where a violet light in an open door kept him from seeing inside [1]. He heard a whirring sound and indistinguishable voices. When he touched the object with his gloved left hand the glove burned, the door closed, and the object started rotating counter-clockwise, then also departed vertically toward the south. His shirt was burned from the exhaust panels on the object's outer edge, and he needed treatment for burns on his stomach [2].",
          "He worked as an industrial mechanic at the Inland Cement Company in Winnipeg [7]."
        ]
      },
      {
        heading: "Burns and treatment",
        paras: [
          "His physician, Dr. R. D. Oatway, wrote in September that Michalak suffered first degree burns to the upper abdominal wall, which he attributed to a blast of hot compressed air from an object that landed near him, and that he was treated at Misericordia Hospital. The next day he was weak, nauseated and unable to eat, but rational and coherent. The letter dates the burns to 21 May rather than 20 May [3].",
          "Nuclear medicine staff at Winnipeg General Hospital checked the burn, clothing and blood for radioactivity and apparently found none. Michalak lost about 13 pounds; blood counts on 24 and 30 May were normal except for a sedimentation rate of 22 (falling to 9) and lymphocytes of 16 per cent (rising to 21) [3].",
          "Later retellings often describe radiation sickness; the file records no radioactivity found in his burn, clothing or blood, and the nuclear-medicine physician considered the injuries thermal burns [3][8]."
        ]
      },
      {
        heading: "Searching for the site",
        paras: [
          "Squadron Leader P. Bissky, who investigated alongside the RCMP, reported that searches on 25 and 31 May, the second by four RCAF and two RCMP men with a helicopter, found nothing. On 1 June Michalak led the ground party himself, again without success [4].",
          "Bissky recorded doubts. Michalak had denied drinking at Falcon Lake, yet a witness said he had served him four or five bottles of beer the night before, and in the bush he appeared very confused in his sense of direction [4]. Professor Roy Craig of the University of Colorado UFO project told Bissky he doubted the report and thought Michalak might have been subject to hallucinations [5].",
          "Bissky nevertheless found the burns unexplained. The burned areas of the shirt did not readily align with the abdominal burns, and a burned shirt found near a local microwave tower proved to be a telephone company cleaning rag [5]."
        ],
        quote: {
          text: "Therefore, the source of the burns is a mystery except for Mr. Michalak's explanation.",
          who: "S/L P. Bissky, investigation report",
          src: 5
        }
      },
      {
        heading: "Radium on the rock",
        paras: [
          "Michalak, who had since been back to the area, led investigators including Bissky, the RCMP and S. E. Hunt of the federal Radiation Protection Division to the site in late July, after samples submitted for testing had shown contamination [9]. Bissky dated the visit 28 July; Hunt's notes give 27 July. They found an approximately 15-foot circle on the rock where moss and earth had been cleared; the only radioactive spot was about four inches across and again showed a radium source [6][7].",
          "Hunt found the whole contaminated area no larger than 100 square inches. Under ultraviolet light the site samples gave an indication of contamination with radium luminous paint; Inland Cement told him it had never used radium sources [7].",
          "Hunt's report concluded that contamination of rock and lichens had been found and that its origin was undetermined, and that the levels were not high enough to create a radiation hazard to the general public [8]. His division told National Defence on 15 September that it had not been possible to determine how radium-226 came to be at the site [9]."
        ],
        quote: {
          text: "The radiation levels measured were not high enough to create a radiation hazard to the general public.",
          who: "S. E. Hunt, Radiation Protection Division report, 1967",
          src: 8
        }
      },
      {
        heading: "An open file",
        paras: [
          "National Defence's review of 1967 sightings stated that the radiologist could not explain what caused the contamination, and that neither the DND nor the RCMP investigation teams were able to provide evidence which could dispute Michalak's story. It concluded that although the investigation had been completed, an explanation or conclusion was still lacking [10].",
          "Its Falcon Lake entry does not mention the discrepancies Bissky recorded, and its statement that the samples had to be safely disposed of sits alongside Hunt's finding of no public hazard [4][8][10]. No document in the file identifies the cause of the burns or of the radium found at the site."
        ]
      }
    ],
    timeline: [
      {
        date: "1967-05-20",
        event: "Michalak reports an encounter with two objects near Falcon Lake and is treated for burns at Misericordia Hospital.",
        src: 3
      },
      {
        date: "1967-05-23",
        event: "RCC Winnipeg sends the UFO report to Canadian Forces Headquarters.",
        src: 1
      },
      {
        date: "1967-06-01",
        event: "Michalak leads an RCAF and RCMP ground party but cannot find the site.",
        src: 4
      },
      {
        date: "1967-07-28",
        event: "Michalak leads investigators to a rock with a small radium-contaminated spot.",
        src: 6
      },
      {
        date: "1967-09-15",
        event: "Radiation Protection Division reports the radium's origin could not be determined.",
        src: 9
      },
      {
        date: "1967-09-19",
        event: "Dr. Oatway sends the military a summary of Michalak's treatment.",
        src: 3
      }
    ],
    sources: [
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749597.jpg",
        note: "RCC Winnipeg UFO report, 23 May, p. 1"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749598.jpg",
        note: "RCC Winnipeg UFO report, p. 2"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749654.jpg",
        note: "Dr. Oatway medical letter, 19 Sept 1967"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749615.jpg",
        note: "Bissky investigation report, p. 2"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749616.jpg",
        note: "Bissky investigation report, p. 3"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749645.jpg",
        note: "Bissky supplemental report, 1 Sept, p. 2"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749739.jpg",
        note: "Hunt radiation report, p. 3"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749741.jpg",
        note: "Hunt radiation report, conclusions"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749648.jpg",
        note: "Radiation Protection Division letter, 15 Sept"
      },
      {
        url: "https://data2.collectionscanada.gc.ca/e/e110/e002749806.jpg",
        note: "DND 1967 UFO review, p. 14"
      }
    ],
    updated: "2026-10-03"
  }
};
