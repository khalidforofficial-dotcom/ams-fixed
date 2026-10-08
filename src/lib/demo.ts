export type SeedRecord = { id: string; type: string; data: Record<string, unknown> };

const boysBn = ["আরিফ হাসান","সিয়াম আহমেদ","রায়হান কবির","তানভীর ইসলাম","মেহেদী হাসান","শাকিব হোসেন","নাঈম রহমান","ফাহিম মিয়া","আদনান চৌধুরী","জুবায়ের আলম"];
const boysEn = ["Arif Hasan","Siam Ahmed","Rayhan Kabir","Tanvir Islam","Mehedi Hasan","Shakib Hossain","Naim Rahman","Fahim Mia","Adnan Chowdhury","Jubayer Alam"];
const girlsBn = ["তাসনিম আক্তার","নুসরাত জাহান","সাদিয়া ইসলাম","মারিয়া সুলতানা","ফারিহা রহমান","আয়েশা সিদ্দিকা","লামিয়া আক্তার","সুমাইয়া হক","মেহজাবিন নূর","জান্নাতুল ফেরদৌস"];
const girlsEn = ["Tasnim Akter","Nusrat Jahan","Sadia Islam","Maria Sultana","Fariha Rahman","Ayesha Siddika","Lamia Akter","Sumaiya Haque","Mehjabin Noor","Jannatul Ferdous"];
const bloods = ["A+","B+","O+","AB+","A-","B-"];
const subjects: Record<string,string[]> = {
  lower: ["Bangla","Mathematics","English","Religion","Arts & Crafts","Physical Education","Work Oriented Education"],
  upper: ["Bangla","English","Mathematics","Primary Science","Bangladesh & Global Studies","Religion","Arts & Crafts","Physical Education"],
};

export const schoolSettings = {
  emis: "310120504", ipemis: "682931", established: "1972", session: "2026", address: "শান্তিপুর, মির্জাপুর, টাঙ্গাইল", addressEn: "Shantipur, Mirzapur, Tangail", receiptSerial: 1042, certificateSerial: 126, clock24: false,
  classes: ["1","2","3","4","5"], sections: ["A","B"], terms: ["1st Term","2nd Term","3rd Term","Annual"],
  grades: [{g:"A+",min:80},{g:"A",min:70},{g:"B",min:60},{g:"C",min:50},{g:"D",min:40},{g:"F",min:0}],
};

export function makeDemoRecords(): SeedRecord[] {
  const out: SeedRecord[] = [];
  const teachers = [
    ["মোঃ কামরুল হাসান","Md. Kamrul Hasan","Head Teacher","01711000001"], ["শারমিন আক্তার","Sharmin Akter","Assistant Teacher","01711000002"],
    ["আব্দুল্লাহ আল মামুন","Abdullah Al Mamun","Assistant Teacher","01711000003"], ["নাজমা খাতুন","Nazma Khatun","Assistant Teacher","01711000004"],
    ["মোঃ সাইফুল ইসলাম","Md. Saiful Islam","Assistant Teacher","01711000005"], ["তাহমিনা ইয়াসমিন","Tahmina Yasmin","Assistant Teacher","01711000006"],
    ["রফিকুল ইসলাম","Rafiqul Islam","Physical Education Teacher","01711000007"], ["সাবিনা ইয়াসমিন","Sabina Yasmin","Pre-primary Teacher","01711000008"],
  ];
  teachers.forEach((t,i)=>out.push({id:`teacher-${i+1}`,type:"teacher",data:{nameBn:t[0],nameEn:t[1],designation:t[2],mobile:t[3],email:`teacher${i+1}@demo.ams`,joinDate:`20${12+i}-01-10`,salary:28000+i*1750,gender:i%3===0?"Male":"Female",bloodGroup:bloods[i%bloods.length],assignedClasses:[String((i%5)+1)],photo:"",status:"Active"}}));
  for(let i=0;i<120;i++){
    const gender=i%2===0?"Male":"Female"; const classNo=String(Math.floor(i/24)+1); const section=i%24<12?"A":"B"; const roll=(i%12)+1;
    const n=i%10; const en=gender==="Male"?boysEn[n]:girlsEn[n]; const bn=gender==="Male"?boysBn[n]:girlsBn[n];
    out.push({id:`student-${i+1}`,type:"student",data:{admissionNo:`2026${String(i+1).padStart(3,"0")}`,class:classNo,section,roll,nameEn:`${en} ${Math.floor(i/20)+1}`,nameBn:bn,gender,dob:`${2014+Number(classNo)}-${String((i%9)+1).padStart(2,"0")}-${String((i%25)+1).padStart(2,"0")}`,bloodGroup:bloods[i%bloods.length],nationality:"Bangladeshi",birthRegistrationNo:`2016${String(1000000000000+i)}`,fatherName:gender==="Male"?"Md. Abdul Karim":"Md. Mizanur Rahman",fatherMobile:`01${[7,8,9,6][i%4]}${String(10000000+i).slice(-8)}`,fatherOccupation:["Farmer","Business","Service","Teacher"][i%4],motherName:"Mrs. Roksana Begum",motherMobile:`018${String(20000000+i).slice(-8)}`,motherOccupation:"Homemaker",guardian:"Father",address:"Shantipur, Mirzapur, Tangail",previousSchool:i<24?"N/A":"Shantipur Kindergarten",previousClass:i<24?"N/A":String(Number(classNo)-1),previousResult:"Passed",height:`${110+Number(classNo)*5} cm`,weight:`${20+Number(classNo)*3} kg`,eyesight:"Normal",diseases:"None",admissionDate:`2026-01-${String((i%20)+2).padStart(2,"0")}`,photo:"",status:"Active"}});
  }
  const feeTypes=[["Admission Fee",1200],["Monthly Tuition",350],["Exam Fee",500],["Session Fee",800],["Other",200]];
  feeTypes.forEach((f,i)=>out.push({id:`fee-${i+1}`,type:"feeType",data:{name:f[0],amount:f[1],rule:i===1?"monthly":"per-student",active:true}}));
  for(let i=0;i<86;i++) out.push({id:`payment-${i+1}`,type:"payment",data:{studentId:`student-${(i%70)+1}`,studentName:out[8+(i%70)].data.nameEn,admissionNo:`2026${String((i%70)+1).padStart(3,"0")}`,feeType:i%4===0?"Exam Fee":"Monthly Tuition",amount:i%4===0?500:350,discount:i%11===0?50:0,date:`2026-${String(1+(i%3)).padStart(2,"0")}-${String(1+(i%27)).padStart(2,"0")}`,receiptNo:`R-${1001+i}`,method:i%3===0?"bKash":"Cash"}});
  const notices=[
    ["বার্ষিক ক্রীড়া প্রতিযোগিতা","Annual Sports Day","2026-04-18","Notice"],["স্বাধীনতা দিবস","Independence Day Programme","2026-03-26","Event"],["অভিভাবক সমাবেশ","Parent–Teacher Meeting","2026-04-05","Notice"],["প্রথম সাময়িক পরীক্ষা","First Term Examination","2026-05-10","Exam"],["গ্রীষ্মকালীন ছুটি","Summer Vacation","2026-06-01","Holiday"],["বই বিতরণ","Textbook Distribution","2026-01-01","Notice"]
  ];
  notices.forEach((n,i)=>out.push({id:`notice-${i+1}`,type:"notice",data:{titleBn:n[0],title:n[1],date:n[2],category:n[3],body:"প্রিয় শিক্ষার্থী ও অভিভাবকবৃন্দ, বিস্তারিত তথ্যের জন্য বিদ্যালয় অফিসে যোগাযোগ করুন।",pinned:i<2,audience:"All"}}));
  ["শহীদ দিবস","স্বাধীনতা দিবস","বাংলা নববর্ষ","মে দিবস","বুদ্ধ পূর্ণিমা","ঈদুল আজহা","দুর্গাপূজা","বিজয় দিবস"].forEach((h,i)=>out.push({id:`holiday-${i+1}`,type:"holiday",data:{title:h,date:["2026-02-21","2026-03-26","2026-04-14","2026-05-01","2026-05-31","2026-06-28","2026-10-21","2026-12-16"][i],days:i===5?5:1}}));
  for(let c=1;c<=5;c++) out.push({id:`syllabus-${c}`,type:"syllabus",data:{class:String(c),title:`Class ${c} Syllabus — 2026`,content:`Bangla: Units 1–8\nEnglish: Lessons 1–10\nMathematics: Chapters 1–9\nEnvironmental Studies and co-curricular activities.`}});
  for(let c=1;c<=5;c++) ["Bangla","English","Mathematics","Religion"].forEach((s,j)=>out.push({id:`routine-${c}-${j}`,type:"routine",data:{class:String(c),term:"1st Term",date:`2026-05-${String(10+j*2).padStart(2,"0")}`,subject:s,time:"10:00 AM – 12:00 PM",shift:"Morning"}}));
  for(let i=0;i<120;i++){
    const c=String(Math.floor(i/24)+1); subjects[Number(c)<=2?"lower":"upper"].forEach((subject,j)=>{
      const max=j >= (Number(c)<=2?3:6)?50:100; const mark=Math.min(max,Math.round(max*(0.43+((i*7+j*11)%53)/100)));
      out.push({id:`result-${i+1}-${j}`,type:"result",data:{studentId:`student-${i+1}`,class:c,section:i%24<12?"A":"B",term:"1st Term",subject,continuous:Math.round(mark*(Number(c)<=2?.5:.3)),summative:mark-Math.round(mark*(Number(c)<=2?.5:.3)),total:mark,max}});
    });
  }
  for(let d=1;d<=30;d++) for(let i=0;i<120;i++) out.push({id:`att-2026-03-${String(d).padStart(2,"0")}-${i+1}`,type:"attendance",data:{studentId:`student-${i+1}`,class:String(Math.floor(i/24)+1),section:i%24<12?"A":"B",date:`2026-03-${String(d).padStart(2,"0")}`,status:(i+d)%17===0?"Absent":(i+d)%13===0?"Late":"Present"}});
  [["teacher-2","Casual leave","Pending"],["teacher-4","Medical leave","Approved"],["teacher-6","Home visit","Rejected"]].forEach((l,i)=>out.push({id:`leave-${i+1}`,type:"leave",data:{teacherId:l[0],teacherName:teachers[Number(l[0].split("-")[1])-1][1],leaveType:l[1],from:"2026-04-10",to:"2026-04-12",reason:"Family necessity",status:l[2],reviewNote:i===2?"Please resubmit dates":""}}));
  ["Question bank: Mathematics","Half-yearly English paper","Class 4 marks sheet"].forEach((x,i)=>out.push({id:`submission-${i+1}`,type:"submission",data:{teacherId:`teacher-${i+2}`,teacherName:teachers[i+1][1],category:i===0?"Question":i===1?"Paper":"Marks",title:x,status:"Pending review",createdAt:"2026-03-20",text:i===2?"1: 78\n2: 65\n3: 82":""}}));
  for(let i=0;i<6;i++) out.push({id:`certificate-${i+1}`,type:"certificate",data:{serial:`CERT-${120+i}`,studentId:`student-${i+1}`,studentName:out[8+i].data.nameBn,type:["প্রত্যয়নপত্র","চারিত্রিক সনদ","প্রশংসাপত্র","TC"][i%4],issuedAt:`2026-03-${10+i}`,purpose:"Educational purpose"}});
  return out;
}
