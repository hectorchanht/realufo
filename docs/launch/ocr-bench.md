# PaddleOCR benchmark (2026-10-03)

16 pages that fail `keep_page` today, from 8 files. Readable = passes `fulltext.keep_page`.

| config | s/page | readable |
|---|---|---|
| pdftotext (today) | – | 0/16 |
| PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200 | 14.3 | 11/16 |
| PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300 | 20.0 | 11/16 |
| PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200 | 51.8 | 11/16 |
| PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300 | 168.9 | 10/16 |

## AARO-22-F-1364_3 p.1

**pdftotext:**
```
Page 09 of 11
(b)(5)
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
Page 09 of 11
(b)(5)
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
Page 09 of 11
(b)(5)
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
Page 09 of 11
(b)(5)
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
Page 09 of 11
(b)(5)
```

## AARO-22-F-1364_3 p.2

**pdftotext:**
```
Page 10 of 11
(b)(5)
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
Page 10 of 11
(b)(5)
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
Page 10 of 11
(b)(5)
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
Page 10 of 11
(b)(5)
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
Page 10 of 11
(b)(5)
```

## 65-hs1-834228961-62-hq-83894-serial-153 p.1

**pdftotext:**
```
FBI - CENTRAL RECORDS CENTER
HQ - HEADQUARTERS
Class I Case#
0062 83894

Sub

Vol.

Serial #

1

153

8/11/1274168

II II II II RRP003
1111111111
11111
IXGA

ONLY
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
C2-HQ-33894 VOL 1 SERIAL 153 ONLY
FBI - CENTRAL RECORDS CENTER
HQ - HEADQUARTERS
Class / Case # Sub Vol. Serial #
0062 83894 1 153 ONLY
8/11/1274168
RRP003IXGA
Declassification authority derived
from FBl Automatic Declassification
Guide, issued May 24, 2007.
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
C2-HQ-33894 VOL SERIAL 153 ONLY
FBI - CENTRAL RECORDS CENTER
HQ - HEADQUARTERS
Class / Case # Sub Vol. Serial #
0062 83894 1 153 ONLY
8/11/1274168
RRP003IXGA
Declassification authority derived
from FBI Automatic Declassification
Guide, issued May 24, 2007.
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
C2-HQ-33894 VOL 1 SERIAL 153 ONLY
FBI - CENTRAL RECORDS CENTER
HQ - HEADQUARTERS
Class / Case # Sub Vol. Serial #
0062 83894 1 153 ONLY
8/11/1274168
RRP003IXGA
Declassification authority derived
from FBl Automatic Declassification
Guide, issued May 24, 2007.
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
8/11/1274168
RRP003IXGA
Declassification authority derived
from FBI Automatic Declassification
Guide, issued May 24, 2007.
```

## 65-hs1-834228961-62-hq-83894-serial-153 p.2

**pdftotext:**
```
•

JQIOXVILLE FILE #65-11

RE:

"FLYING SAOOll!S" OB.SERVED OVER OAK RIDGE AREA
INTmNAL SIDURITY - X

ENCLOOURE3 TO J31JREAU:
Two photographs of reputedly "f]J'1ing saucers"

seen at Oak Ridge, Tennessee, during JulJr 1947.
Photostat1o copy of newepa.per clipping appearing

in the Knoxville Newa-Sentine1 concernin.g: these
"flying saucers."

,

\

.,

•
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
KNOXVILLE FILE #65-11
RE: "FLYING SAUCERS" OBSERVED OVER OAK RIDGE AREA
INTERNAL SECURITY - X
ENCLOSURES TO BUREAU:
Two photographs of reputedly "flying saucers"
seen at Oak Ridge, Tennessee, during July 1947.
Photostatic copy of newspaper clipping appearing
in the Knoxville News-Sentinel concerning these
"flying saucers."
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
KNOXVILLE FILE #65-11
RE: "FLYING SAUCERS" OBSERVED OVER OAK RIDGE AREA
INTERNAL SECURITY - X
ENCLOSURES TO BUREAU:
Two photographs of reputedly "flying saucers
seen at Oak Ridge, Tennessee, during July l947.
Photostatic copy of newspaper clipping appearing
in the Knoxville News-Sentinel concerning these
"flying saucers.' 11
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
KNOXVILLE FILE #65-11
RE: "FLYING SAUCERS" OBSERVED OVER OAK RIDGE AREA
INTERNAL SECURITY - X
ENCLOSURES TO BUREAU:
Two photographs of reputedly "flying saucers"
seen at Oak Ridge, Tennessee, during July l947.
Photostatic copy of newspaper clipping appearing
in the Knoxville News-Sentinel concerning these
"flying saucers."
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
KNOXVILLE FILE #65-11
RE: "FLYING SAUCERS" OBSERVED OVER OAK RIDGE AREA
INTERNAL SECURITY - X
ENCLOSURES TO BUREAU:
Two photographs of reputedly "flying saucers"
seen at Oak Ridge, Tennessee, during July l947.
Photostatic copy of newspaper clipping appearing
in the Knoxville News-Sentinel concerning these
= "flying saucers."
```

## CIA-UAP-005 p.1

**pdftotext:**
```
App�oved for Release 2026

CLASSIFICATION . .;_,.:._.czo:;.__r;
CENTRAL INTELLIGENCE AGENCY

•

REPORT NO.

D N FO lR MATH) �\Jl R E_PO R:1�

$0 DD-27U3

CD NO.

COUNTRY

Chilo/Gorn.any

DATE DISTR.

31 July 1950

SUBJECT

Germtm Scientist I s ,\rticle on "Fl.yin(! Discs"

NO, Of PAGES

l

PLACE
ACQUIRED

Chile, :',antiago

(LISTED BELOW)

NO. OF ENCLS.

l

DATE OF
INFO.

Prior to nid-1950

SUPPLE
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
Approved for Release 2026 1200
CLASSIFICATION
CENTRAL. INTELLIGENCE AGENCY REPORT NO. SO DB-27143
INFORMATION REPORT CD NO.
COUNTRY Chile/Gormany DATE DISTR. 31 July 1950
SUBJECT German Scientist's Article on "Flying Discs" NO. OF PAGES 1
PLACE Kotard to (ia Licrary NO. OF ENCLS. 1
ACQUIRED Chile, Santiago (LISTED BELOW)
DATE OF SUPPLEMENT TO
INFO. Frior to nid-l950 REPORT NO.
GRADING OF SOURCE CO
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
Approved for Release 2026 1200
Lra
CLASSIFICATION
CENTRAL INTELLIGENCE AGENCY REPORT NO. SO DB-27143
INFORMATION REPORT CD NO.
COUNTRY Chile/Gornany DATE DISTR. 31 July 1950
SUBJECT German Scientist's Article on "Flying Discs" NO. OF PAGES 1
PLACE Rotare to tia Library NO. OF ENCLS. 1
ACQUIRED Chile, Santiago (LISTED BELOW)
DATE OF SUPPLEMENT TO
INFO. Frior to nid-1950 REPORT NO.
GRADING OF SOURCE
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
Approved for Release 2026 1200
CLASSIFICATION
CENTRAL. INTELLIGENCE AGENCY REPORT NO. SO DB-27143
INFORMATION REPORT CD NO.
COUNTRY Chile/Gormany DATE DISTR. 31 July 1950
SUBJECT German Scientist's Article on "Flying Discs" NO. OF PAGES 1
PLACE Rotare io (ia Licrary NO. OF ENCLS. 1
ACQUIRED Chile, Santiago (LISTED BELOW)
DATE OF SUPPLEMENT TO
INFO. Frior to nid-l950 REPORT NO.
GRADING OF SOURCE CO
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
Approved for Release 2026
CLASSIFICATION
CENTRAL INTELLIGENCE AGENCY REPORT NO. SO DB-27143
INFORMATION REPORT CD NO.
COUNTRY Chile/Gormany DATE DISTR. 31 July 1950
SUBJECT German Scientist's Article on "Flying Discs" NO. OF PAGES 1
PLACE NO. OF ENCLS. 1
ACQUIRED Chile, Santiago (LISTED BELOW)
DATE OF SUPPLEMENT TO
INFO. Frior to nid-1950 REPORT NO.
GRADING OF SOURCE COLLECTOR'S PRELIMINARY GRADIN
```

## CIA-UAP-005 p.2

**pdftotext:**
```

```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
RESTRIOTED 
CENTRAL INTELLIGENCE AGENCY SO DB-27143
Attachment 1
-l
THE MYSTERY OF THE "FLYING DISCS"
A contribution to its possible explanation.
By Dr. Eduard Ludwig, Santiago, Chile.
Av. Cristobal Colon 1916
Though the continuously reappearing reports on the appearance of now,
mysterious airoraft of unknown construction should be considered with severe
skepticism as the result of a sort of mass-
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
RESTRIOTED
CENTRAL INTELLIGENCE AGENCY SO DB-27143
Attachment 1
-l-
THE MYSTERY OF THE "FLYING DISCS"
A contribution to its possible explanation.
By Dr. Eduard Ludwig, Santiago, Chile.
Av. Cristobal Colon l916
Though the continuously reappearing reports on the appearance of new,
mysterious airoraft of unknown construction should be considered with severe
skepticism as the result of a sort of mass-
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
RESTRIOTED 
2
CENTRAL INTELLIGENCE AGENCY S0 DB-27143
Attachment 1
-1
THE MYSTERY OF THE "FLYING DISCS"
A contribution to its possible explanation.
By Dr. Eduard Ludwig, Santiago, Chile.
Av. Cristobal Colon l9l6
Though the continuously reappearing reports on the appearance of new,
mysterious airoraft of unknown construction should be considered with severe
skepticism as the result of a sort of mas
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
omamtamnn
CENTRAL INTELLIGENCE AGENCY SO DB-27143
Attachment 1
-l
THE MYSTERY OF THE "FLYING DISCS"
A contribution to its possible explanation.
By Dr. Eduard Ludwig, Santiago, Chile.
Av. Cristobal Colon l9l6
Though the continuously reappearing reports on the appearance of new,
mysterious airoraft of unknown construction should be considered with severe
skepticism as the result of a sort of mass-hy
```

## DOW-UAP-D060 p.1

**pdftotext:**
```

```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
Declassified by MG Richard A. Harrison
USCENTCOM Chief of Staff
Declassified on: 20 March 2026
Misrep 4592219
Narrative
AT 0337Z1.4aTOOK OFF FROM OKAS. AT 0359Z.1.4aHANDED OVER FROM THE
LRE. FROM 0434Z TO 2300Z, 1.4a COLLECTED SIGINT VIA AIRHANDLER. FROM 0513Z TO
2256Z,1.4aSUPPORTED NAVCENT TO OPERATION 1.4a ]IVo arabian
GULF, STRAIT OF HORMUZ AND GULF OF OMAN. SEE ISR LINE 1. AT 0726Z, 1.4a
OBSER
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
Declassified by MG Richard A. Harrison
USCENTCOM Chief of Staff
Declassified on: 20 March 2026
Misrep 4592219
Narrative
AT 0337Z1.4aTOOK OFF FROM OKAS. AT 0359Z, 1.4aHANDED OVER FROM THE
LRE. FROM 0434Z TO 2300Z, 1.4a COLLECTED SIGINT VIA AIRHANDLER. FROM 0513Z TO
2256Z,1.4aSUPPORTED NAVCENT TO OPERATION 1.4a IVo ARABIAN
GULF, STRAIT OF HORMUZ AND GULF OF OMAN. SEE ISR LINE 1. AT 0726Z, 1.4a
OBSER
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
Declassified by MG Richard A. Harrison
USCENTCOM Chief of Staff
Declassified on: 20 March 2026
Misrep 4592219
Narrative
AT 0337Z 1.4a TOOK OFF FROM OKAS. AT 0359Z 1.4a HANDED OVER fROM THE
LRE. FROM 0434Z TO 2300Z, 1.4a COLLECTED SIGINT VIA AIRHANDLER. FROM 0513Z TO
2256Z, 1.4a SUPPORTED NAVCENT TO OPERATION 1.4a IVO ARABIAN
GULF, STRAIT OF HORMUZ AND GULF OF OMAN. SEE ISR LINE 1. AT O726Z, 1.4a
O
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
Declassified by MG G Richard A. Harrison
USCENTCOM Chief of Staff
Declassified on 20 March 2026
Misrep 4592219
Narrative
AT 0337Z 1.4a TOOK OFF FROM OKAS. AT 0359Z1.4a HANDED OVER FROM THE
LRE. FROM 0434Z TO 2300Z,1.4a COLLECTED SIGINT VIA AIRHANDLER. FROM 0513Z TO
2256Z,1.4aSUPPORTED NAVCENT TO OPERATION 1.4a IVO ARABIAN
GULF, STRAIT OF HORMUZ AND GULF OF OMAN. SEE ISR LINE 1. AT 0726Z, 1.4a
OBSE
```

## DOW-UAP-D060 p.2

**pdftotext:**
```

```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
Declassified by MG Richard A. Harrison
USCENTCOM Chief of Staff
Declassified on: 20 March 2026
Mission Type: AREC
ATO Mission Number: 1.4a
Country Tasked: US - UnITED STATES
Service Tasked: A - AIR FORCE
Poc
POC
Rank: SrA
Full Name: {(b)(3){b)(6}
Unit: 482ATKS
Wing: 432 AEW
Phone Number: (b)(6)
Email: (b)(6}
Service: Air Force
Operations Center: 603 AOC
QC
Rank: Ctr
Full Name: (b)(6)
Unit: PAROC D
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
Declassified by MG Richard A. Harrison
USCENTCOM Chief of Staff
Declassified on: 20 March 2026
Mission Type: AREC
ATO Mission Number: 1.4a
Country Tasked: US - UnIteD STATES
Service Tasked: A - AIR FORCE
Poc
POC
Rank: SrA
Full Name: (b)(3)(b)(6}
Unit: 482ATKS
Wing: 432 AEW
Phone Number: (b)(6)
Email: (b)(6)
Service: Air Force
Operations Center: 603 AOC
QC
Rank: Ctr
Full Name: (b)(6)
Unit: PAROC ID
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
Declassified by MG Richard A, Harrison
USCENTCOM Chief of Staff
Declassified on: 20 March 2026
Mission Type: AREC
•ATO Mission Number: 1.4a
Country Tasked: US - UNITED STATES
Service Tasked: A - AIR FORCE
Poc
POC
Rank: SrA
Full Name:[ {b)(3)(b)(6}
Unit: 482ATKS
Wing: 432 AEW
Phone Number: (b)(6)
Email: (b)6)
Service: Air Force
Operations Center: 603 AOC
QC
Rank: Ctr
Full Name: (b)(6)
Unit: PAROC I
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
Declassified by MG Richard A. Harrison
USCENTCOM Chief of Staff
Declassified on 20 March 2026
Mission Type: AREC
ATO Mission Number: 1.4a
Country Tasked: US - UNITED STATES
Service Tasked: A - AIR FORCE
Poc
POC
Rank: SrA
Full Name: (b)(3)(b)(6}
Unit: 482ATKS
Wing: 432 AEW
Phone Number: (b)(6)
Email (b)(6)
Service: Air Force
Operations Center: 603 AOC
QC
Rank: Ctr
Full Name: (b)(6)
Unit: PAROC IDAT
```

## DOW-UAP-D085 p.1

**pdftotext:**
```
Authority:
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
ZU16 MN
NNN318 G
CECSSEEID
Esbl ebe
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
Esbl ebe
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
Z1E146 MN
Esbl ebe
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
ZAEL46 MN
CESSEDD
Esbl ebe
```

## DOW-UAP-D085 p.2

**pdftotext:**
```

```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
HERE
689/2
MNT
ES TO ET
OL
ESOT UDTN LT
Thon MW
8961
WILL OL WILINAN
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
ZUSUG MN
X
OALE
HERE
\
DA1E
HERE
689 E Suiluq o suoonsu 10
MNT
OTSCU
7OEVS
4m prwom
I I ES JO ET
DATE
OHR GAAO
R   A H N B  B
E   E E   2
C O S  MARE
CO   P CML
Shon MW {
SEE  
8961
EI 88 15 ILINA
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
2L816MN
CUTHERE T
CUT BERE_ GEEEEEEG
689/0
013C0
 s sum
5/0528 0N1N
a3arasau saunsoisi uo sgsTqueros Jo Toueg B Aporedok arodey Y- 1oarens
T ESTOET
Jon/oes
OL
WLITNI
NOWL
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
ZEELG MN
h CUT HERE CUT HERE DA1E
682/0
MNT
  o   s yoy h
provom of satto
5/0028
T   J0  o 
I 17T ES IST ET
DAIE
(    p) 
(otd suga jo s o ppeaio q o ard
BILES 2 E
EE   E E  AE
FO
CN   P CA
MW
Punsa
```

## FBI-UAP-D013 p.1

**pdftotext:**
```
FEDERAL BUREAU
of

SEATTLE FILE NO. LQ,Q / /X,1,J ·." • •

-

REVlEVVED ON .. t

FOR FOl/PA 190· J//6

;'

i

'

' /

•,N ~ ~ -

••

I·Q'~c:,1 d:~i 1-t~~x-.a·~:s .~ ·1). -. -~: ., ;__ :· ·--<- _

.••

-

. -
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
Declassification authority derived
from FBI Automatic Declassification
Guide, issued May 24, 2007.
Form No. 1-D. of I.
H. S. Department of Juskice
(MATERIAL MUST NOT BE REMOVED FROM OR ADDED TO THIS FILE)
Sub. File No.
FEDERAL BUREAU 0-18945
of
INVESTIGATION
whale 7ile
O NOT DESTROY WITHOUT
CONSULTING FOLPA COORDINATOR
190-87 vol.1
SEATTLE FILE NO.100-18945
REVIEWED ON 4/84
FOR FO1/PA 190-306
See 
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
Declassification authority derived
from FBI cation
Guide, issued May 24, 2007.
Form No. 1-D. of I.
H. S. Department of Juskice
(MATERIAL MUST NOT BE REMOVED FROM OR ADDED TO THIS FILE)
No.
FEDERAL BUREAU
of
INVESTIGATION
whole 7ile
DO NOT DESTROY WITHOUT
CONSULTING COORDINATOR
190-87 vol.1
REVIEWED ON 4/84
FOR FO1/PA 190-306
See also Nos..
U. S. GOVERNMENT PRINTING OFFICE 16-52991-1
NW 90291
Docld
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
Declassification authority derived
from FBI Automatic Declassification
Guide, issued May 24, 2007
Form No. 1D. of I.
H. S. Department of Justice
(MATERIAL MUST NOT BE REMOVED FROM OR ADDED TO THIS FILE)
Sub. File No..
FEDERAL BUREAU
of 18945
INVESTIGATION
whole 7ile
OO NOT DESTROY WITHOUT
CONSULTING FOMPA COORDINATOR
190-87 vol.1
SEATTLE FILE NO.10O-1894S
REVIEWED ON 4184
FOR FO1/PA 190-306
See al
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
Declassification authority derived
from FBI Automatic Declassification
Guide, issued May 24, 2007
Form No. 1-D.of I.
H. S. Department of Justice
(MATERIAL MUST NOT BE REMOVED FROM OR ADDED TO THIS FILE)
File No.
FEDERAL BUREAU 00-18945
of
INVESTIGATION
whole 7ile
DO NOT DESTROY WITHOUT
CONSULTING FOMPA COORDINATOR
190-87 vol.1
SEATTLE FILE NO./00-18945
FOR FO1/PA 190-306
See also Nos.
U. S. GOVERN
```

## FBI-UAP-D013 p.2

**pdftotext:**
```
i

1

-

11

.

:

n

C-olumbia Basin NOvts .

J uly 29 • 1952
Pasc·o·j W~shington
NW90291
Dodd:34114596 Page 2

J
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
'Saucer'
Like Giant
"It seemed to be traveling at
Pinwheel' terrific speed," she said. "I blink-
ed my eyes once after I first saw
it and it appeared to have gone
A brilliant and high speed miles during the fraction of a
second my eyes were closed.
object that flashed through Mrs. Jorgenson's husband also
witnessed the strange sight.
the sky over Pasco was re- Three boys who were playing
ported by
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
Saucer
Like Giant
"It seemed to be traveling at
'Pinwheel' terrific speed," she said. "I blink-
ed my eyes once after I first saw
it and it appeared to have gone
A brilliant and high speed miles during the fraction of a
second my eyes were closed.
object that flashed through Mrs. Jorgenson's husband also
the sky over Pasco was re- witnessed the strange sight.
Three boys who were playing
ported by 
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
PASCOITES SPOT
MYSTERY' OBJECT
Saucer
Like Giant
"It seemed to be traveling at
'Pinwheel' terrific speed," she said. "I blink-
ed my eyes once after I first saw
it and it appeared to have gone
miles during the fraction of a
A brilliant and high speed second my eyes were closed."
object that flashed through Mrs. Jorgenson's husband also
witnessed the strange sight.
the sky over Pasco was re- Three 
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
PASCOITES SPOT
MYSTERY' OBJECT
'Saucer
Like Giant
"It seemed to be traveling at
'Pinwheel' terrific speed," she said. "I blink-
ed my eyes once after I first saw
it and it appeared to have gone
miles during the fraction of a
A brilliant and high speed second my eyes were closed."
object that flashed through Mrs. Jorgenson's husband also
witnessed the strange sight.
the sky over Pasco was re- Three
```

## NASA-UAP-D004 p.1

**pdftotext:**
```

```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
DENTIA 94
25/pgs
NATIONAL AERONAUTICS AND SPACE ADMINISTRATION
APOLLO 11
TECHNICAL
CREW DEBRIEFING
(U)
E.0.11652 JULY 31, 1969
LABSIFICATION
PREPARED BY:
DATE MISSION OPERATIONS BRANCH
FLIGHT CREW SUPPORT DIVISION
VOL. I
GROUP 4
Downgraded at 3-year
intervals; declassified
after 12 years
This material :United States
within the me  and 794, the
transmission NOTICE: This document may be exempt from

```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
CONFIDENTIAL 94
25/P98
NASA NATIONAL AERONAUTICS AND SPACE ADMINISTRATION
APOLLO 11
TECHNICAL
CREW DEBRIEFING
(U)
CHANGED T JULY 31, 1969
CLASSIFICATION 72
PREPARED BY:
DATE MISSION OPERATIONS BRANCH
FLIGHT CREW SUPPORT DIVISION
VOL. I
GROUP 4
Downgraded at 3-year
intervals; declassified
after 12 years
This material
within the me :United States
transmission NOTICE: This document may be exempt from
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
CONFDENTIAE 94
25/pg8
NASA NATIONAL AERONAUTICS AND SPACE ADMINISTRATION
APOLLO 11
TECHNICAL
CREW DEBRIEFING
(U)
CLABSIFICATION CHANGED  3-11->2 >2 JULY 31, 1969
BY AUTWORIY PREPARED BY:
DATE MISSION OPERATIONS BRANCH
FLIGHT CREW SUPPORT DIVISION
VOL. I
GROUP 4
Downgraded at 3-year
intervals; declassified
after 12 years
This material
within the me :United States
transmission NOTICE: This document 
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
94
25/pg8
NATIONAL AERONAUTICS AND SPACE ADMINISTRATION
APOLLO 11
TECHNICAL
CREW DEBRIEFING
(U)
, CHANGED E.0.11652 JULY 31, 1969
LABSIFICATION BY AUTWORI 6/1/72 3-11-7
PREPARED BY:
DATE MISSION OPERATIONS BRANCH
FLIGHT CREW SUPPORT DIVISION
VOL.I
GROUP 4
Downgraded at 3-year
intervals; declassified
after 12 years
This material
within the me :United States
transmission NOTICE: This document may be
```

## NASA-UAP-D004 p.2

**pdftotext:**
```

```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
CONFIDENTIAL 6-33
COLLINS I think particularly when you get into the later flights
of extended EVA's and lunar activity, somehow the crew
must place themselves in a frame of mind of looking on
the separation of the LM as the beginning of the flight
plan and to relax, get plenty of sleep, and conserve
their energies in all the events leading up to that
point. To arrive in lunar orbit tired can crea
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
CONFIDENTIAL 6-33
COLLINS I think particularly when you get into the later flights
of extended EVA's and lunar activity, somehow the crew
must place themselves in a frame of mind of looking on
the separation of the LM as the beginning of the flight
plan and to relax, get plenty of sleep, and conserve
their energies in all the events leading up to that
point. To arrive in lunar orbit tired can crea
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
CONFIDENTIAL 6-33
COLLINS I think particularly when you get into the later flights
of extended EVA's and lunar activity, somehow the crew
must place themselves in a frame of mind of looking on
the separation of the LM as the beginning of the flight
plan and to relax, get plenty of sleep, and conserve
their energies in all the events leading up to that
point. To arrive in lunar orbit tired can crea
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
CONFIDENTIAL 6-33
COLLINS I think particularly when you get into the later flights
of extended EVA's and lunar activity, somehow the crew
must place themselves in a frame of mind of looking on
the separation of the LM as the beginning of the flight
plan and to relax, get plenty of sleep, and conserve
their energies in all the events leading up to that
point. To arrive in lunar orbit tired can crea
```

## 38143685box7IncidentSummaries1-100 p.1

**pdftotext:**
```
r.

CLASSIF

"

'

Authority
.

1

NND 917033

I
"'

L

/1

•
'f

'
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
DECLASSIFIED Pulir sec
Authority: 0041
NND 917033
02024° 30014 578-1(126)
615
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
DECLASSIFIED Puldr sec
Authority: 00402
NND 917033
CLRERET
SOET
020240 30014 578-1(126)
615
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
DECLASSIFIED Puldr sec
Authority: 0011
NND 917033
020240 30014
578-1(126)
615
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
SET SORET
020240 30014
578-1(126)
615
```

## 38143685box7IncidentSummaries1-100 p.2

**pdftotext:**
```
CEECK- LIST - UFIDEI-:TlrIED

g July 1947

,. '
Billeting Officer

Mu.roe AAFld ,

or obso rvut i on

•

f r om obs or vo r

Performe,i a tight

disc- like or

•
constru ct ion

•

•

I
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @200:**
```
CONFID
CHECK-LIST - UNIDENTIFIED FLYING OBJECTS
. Date 8 July 1947 Incidont # 1
2. Time 0930
3. Location Muroc Air Field, Muroc, Calif
4. Name of observer lst Lt Joseph C. McHenry
5. Occupation of obsorvor Billeting Officer in Charge, Muroc AAFld.
6 Address of observor Muroc, AAFld
7. Placo of observation ground - Muroc, AAFld
8. Number of objocts 2 at first - 1 sometime later
9. Distance of objoc
```
**PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec @300:**
```
CHECK-LIST - UNIDENTIFIED FLYING OBJECTS
1. Date 8 July 1947 Incident # 1
2. Time 0930
3. Location Muroc Air Field, Muroc, Calif
4. Name of observor lst Lt Joseph C. McHenry
5. Occupation of obsorvor Billeting Officer in Charge, Muroc AAFld.
6. Address of observor Muroc, AAFld
7. Placo of observation ground - Muroc, AAFld
Number of objocts 2 at first - l sometime later
Distance of object from obse
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @200:**
```
CHECK-LIST - UNIDENTIFIED FLYING OBJECTS CONFID TIA/
. Date 8 July 1947 Incidont # 1
2. Time 0930
3. Location Muroc Air Field, Muroc, Calif
4.Name of observor lst Lt Joseph C. McHenry
5. Occupation of obsorvor Billeting Officer in Charge, Muroc AAFld.
6 Address of observor Muroc, AAFld
7. Placo of observation ground - Muroc, AAFld
8. Number of objocts 2 at first - l sometime later
9. Distance of o
```
**PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec @300:**
```
CHECK-LIST - UNIDENTIFIED FLYING OBJECTS CONFIDAIA
1. Date 8 July 1947 Incident # 1
2. Time 0930
3. Location Muroc Air Field, Muroc, Calif
4. Name of observor lst Lt Joseph C. McHenry
5. Occupation of obsorvor Billeting Officer in Charge, Muroc AAFld.
6 Address of observor Muroc, AAFld
7. Placo of observation ground - Muroc, AAFld
8. Number of objocts 2 at first - 1 sometime later
Distance of obje
```
