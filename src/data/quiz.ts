import type { QuizQuestion } from '@/types';

// Policy-neutral questions mapping to parties' publicly stated positions.
// Weights are normalized 0-10 based on party manifestos / publicly stated positions.
// No question is designed to favour any single party.
export const quizQuestions: QuizQuestion[] = [
  {
    id: 'q1',
    category: 'Economic Development',
    categoryBn: 'অর্থনৈতিক উন্নয়ন',
    question: 'What should be the primary focus for economic growth in West Bengal?',
    questionBn: 'পশ্চিমবঙ্গের অর্থনৈতিক প্রবৃদ্ধির প্রধান লক্ষ্য কী হওয়া উচিত?',
    options: [
      {
        id: 'q1a', text: 'Attract large industries and FDI', textBn: 'বৃহৎ শিল্প ও বিদেশি বিনিয়োগ আকর্ষণ',
        partyWeights: { AITC: 6, BJP: 9, INC: 7, 'CPI(M)': 2, RSP: 2, SUCI: 1, IND: 5 },
      },
      {
        id: 'q1b', text: 'Strengthen small & cottage industries (MSMEs)', textBn: 'ক্ষুদ্র ও কুটির শিল্প শক্তিশালী করা',
        partyWeights: { AITC: 7, BJP: 6, INC: 7, 'CPI(M)': 8, RSP: 8, SUCI: 7, IND: 6 },
      },
      {
        id: 'q1c', text: 'Focus on agriculture and rural economy', textBn: 'কৃষি ও গ্রামীণ অর্থনীতিতে মনোযোগ',
        partyWeights: { AITC: 7, BJP: 7, INC: 8, 'CPI(M)': 9, RSP: 9, SUCI: 8, IND: 6 },
      },
      {
        id: 'q1d', text: 'Build IT/tech and services sector', textBn: 'তথ্যপ্রযুক্তি ও সেবা খাত গড়ে তোলা',
        partyWeights: { AITC: 8, BJP: 8, INC: 8, 'CPI(M)': 4, RSP: 3, SUCI: 2, IND: 6 },
      },
    ],
  },
  {
    id: 'q2',
    category: 'Education',
    categoryBn: 'শিক্ষা',
    question: 'What is the most important change needed in West Bengal\'s education system?',
    questionBn: 'পশ্চিমবঙ্গের শিক্ষাব্যবস্থায় সবচেয়ে গুরুত্বপূর্ণ পরিবর্তন কী?',
    options: [
      {
        id: 'q2a', text: 'More government schools with better infrastructure', textBn: 'উন্নত পরিকাঠামোসহ আরও সরকারি বিদ্যালয়',
        partyWeights: { AITC: 7, BJP: 6, INC: 7, 'CPI(M)': 9, RSP: 9, SUCI: 9, IND: 6 },
      },
      {
        id: 'q2b', text: 'Allow private sector & PPP in education', textBn: 'শিক্ষায় বেসরকারি ও পিপিপি অংশগ্রহণ',
        partyWeights: { AITC: 5, BJP: 8, INC: 7, 'CPI(M)': 2, RSP: 2, SUCI: 1, IND: 5 },
      },
      {
        id: 'q2c', text: 'Focus on vocational & skill training', textBn: 'বৃত্তিমূলক ও দক্ষতা প্রশিক্ষণে গুরুত্ব',
        partyWeights: { AITC: 7, BJP: 8, INC: 7, 'CPI(M)': 6, RSP: 6, SUCI: 5, IND: 7 },
      },
      {
        id: 'q2d', text: 'Improve mid-day meals and retention rates', textBn: 'মধ্যাহ্নভোজন ও ঝরে পড়া হ্রাস করা',
        partyWeights: { AITC: 8, BJP: 6, INC: 8, 'CPI(M)': 8, RSP: 8, SUCI: 8, IND: 7 },
      },
    ],
  },
  {
    id: 'q3',
    category: 'Healthcare',
    categoryBn: 'স্বাস্থ্যসেবা',
    question: 'How should healthcare services be improved for ordinary citizens?',
    questionBn: 'সাধারণ মানুষের জন্য স্বাস্থ্যসেবা কীভাবে উন্নত করা উচিত?',
    options: [
      {
        id: 'q3a', text: 'Universal free healthcare from government hospitals', textBn: 'সরকারি হাসপাতালে সার্বজনীন বিনামূল্যে চিকিৎসা',
        partyWeights: { AITC: 7, BJP: 5, INC: 7, 'CPI(M)': 10, RSP: 10, SUCI: 10, IND: 6 },
      },
      {
        id: 'q3b', text: 'Health insurance schemes for all families', textBn: 'সকল পরিবারের জন্য স্বাস্থ্যবিমা প্রকল্প',
        partyWeights: { AITC: 8, BJP: 9, INC: 8, 'CPI(M)': 5, RSP: 4, SUCI: 3, IND: 7 },
      },
      {
        id: 'q3c', text: 'More primary health centres in rural areas', textBn: 'গ্রামাঞ্চলে আরও প্রাথমিক স্বাস্থ্যকেন্দ্র',
        partyWeights: { AITC: 8, BJP: 7, INC: 8, 'CPI(M)': 9, RSP: 9, SUCI: 8, IND: 8 },
      },
      {
        id: 'q3d', text: 'Encourage private hospitals with subsidies', textBn: 'ভর্তুকি দিয়ে বেসরকারি হাসপাতাল উৎসাহিত করা',
        partyWeights: { AITC: 4, BJP: 7, INC: 5, 'CPI(M)': 1, RSP: 1, SUCI: 1, IND: 4 },
      },
    ],
  },
  {
    id: 'q4',
    category: 'Women & Social Welfare',
    categoryBn: 'নারী ও সামাজিক কল্যাণ',
    question: 'What is the best approach to women\'s empowerment?',
    questionBn: 'নারীর ক্ষমতায়নের সর্বোত্তম পদ্ধতি কোনটি?',
    options: [
      {
        id: 'q4a', text: 'Direct cash transfers to women (like Lakshmir Bhandar)', textBn: 'নারীদের সরাসরি নগদ সহায়তা (লক্ষ্মীর ভান্ডারের মতো)',
        partyWeights: { AITC: 9, BJP: 7, INC: 7, 'CPI(M)': 5, RSP: 4, SUCI: 3, IND: 6 },
      },
      {
        id: 'q4b', text: 'Reservation in jobs and education', textBn: 'চাকরি ও শিক্ষায় সংরক্ষণ',
        partyWeights: { AITC: 7, BJP: 6, INC: 8, 'CPI(M)': 8, RSP: 8, SUCI: 7, IND: 6 },
      },
      {
        id: 'q4c', text: 'Self-help groups and micro-finance', textBn: 'স্বনির্ভর গোষ্ঠী ও ক্ষুদ্রঋণ',
        partyWeights: { AITC: 8, BJP: 7, INC: 8, 'CPI(M)': 7, RSP: 7, SUCI: 6, IND: 7 },
      },
      {
        id: 'q4d', text: 'Focus on gender-neutral policies', textBn: 'লিঙ্গ-নিরপেক্ষ নীতিতে গুরুত্ব',
        partyWeights: { AITC: 5, BJP: 6, INC: 6, 'CPI(M)': 6, RSP: 5, SUCI: 5, IND: 6 },
      },
    ],
  },
  {
    id: 'q5',
    category: 'Infrastructure',
    categoryBn: 'পরিকাঠামো',
    question: 'Where should infrastructure spending be prioritized?',
    questionBn: 'পরিকাঠামো ব্যয় কোথায় অগ্রাধিকার দেওয়া উচিত?',
    options: [
      {
        id: 'q5a', text: 'Urban transport & metro expansion', textBn: 'শহুরে যানবাহন ও মেট্রো সম্প্রসারণ',
        partyWeights: { AITC: 8, BJP: 8, INC: 7, 'CPI(M)': 6, RSP: 5, SUCI: 4, IND: 6 },
      },
      {
        id: 'q5b', text: 'Rural roads and connectivity', textBn: 'গ্রামীণ রাস্তা ও যোগাযোগ',
        partyWeights: { AITC: 8, BJP: 8, INC: 8, 'CPI(M)': 9, RSP: 9, SUCI: 8, IND: 8 },
      },
      {
        id: 'q5c', text: 'Power and electricity access for all', textBn: 'সকলের জন্য বিদ্যুৎ সংযোগ',
        partyWeights: { AITC: 8, BJP: 9, INC: 8, 'CPI(M)': 8, RSP: 7, SUCI: 7, IND: 8 },
      },
      {
        id: 'q5d', text: 'Industrial corridors and ports', textBn: 'শিল্প করিডোর ও বন্দর',
        partyWeights: { AITC: 6, BJP: 9, INC: 7, 'CPI(M)': 3, RSP: 3, SUCI: 2, IND: 5 },
      },
    ],
  },
  {
    id: 'q6',
    category: 'Agriculture',
    categoryBn: 'কৃষি',
    question: 'What is the most urgent need for farmers in West Bengal?',
    questionBn: 'পশ্চিমবঙ্গের কৃষকদের সবচেয়ে জরুরি প্রয়োজন কী?',
    options: [
      {
        id: 'q6a', text: 'Guaranteed Minimum Support Price (MSP)', textBn: 'নিশ্চিত ন্যূনতম সহায়তা মূল্য (এমএসপি)',
        partyWeights: { AITC: 7, BJP: 6, INC: 8, 'CPI(M)': 9, RSP: 9, SUCI: 9, IND: 7 },
      },
      {
        id: 'q6b', text: 'Subsidised inputs (seeds, fertilisers, power)', textBn: 'ভর্তুকিযুক্ত কৃষিসামগ্রী (বীজ, সার, বিদ্যুৎ)',
        partyWeights: { AITC: 8, BJP: 8, INC: 8, 'CPI(M)': 8, RSP: 7, SUCI: 7, IND: 8 },
      },
      {
        id: 'q6c', text: 'Improved irrigation and water management', textBn: 'উন্নত সেচ ও জলসম্পদ ব্যবস্থাপনা',
        partyWeights: { AITC: 7, BJP: 7, INC: 8, 'CPI(M)': 8, RSP: 8, SUCI: 7, IND: 8 },
      },
      {
        id: 'q6d', text: 'Promote corporate farming and agritech', textBn: 'কর্পোরেট কৃষি ও কৃষিপ্রযুক্তি প্রসার',
        partyWeights: { AITC: 3, BJP: 7, INC: 4, 'CPI(M)': 1, RSP: 1, SUCI: 1, IND: 4 },
      },
    ],
  },
  {
    id: 'q7',
    category: 'Law & Order',
    categoryBn: 'আইনশৃঙ্খলা',
    question: 'What approach to law and order do you think is most effective?',
    questionBn: 'আইনশৃঙ্খলা বজায় রাখার ক্ষেত্রে কোন পদ্ধতি সবচেয়ে কার্যকর বলে মনে করেন?',
    options: [
      {
        id: 'q7a', text: 'Stronger police force with better equipment', textBn: 'উন্নত সরঞ্জামসহ শক্তিশালী পুলিশ বাহিনী',
        partyWeights: { AITC: 7, BJP: 8, INC: 6, 'CPI(M)': 5, RSP: 5, SUCI: 4, IND: 6 },
      },
      {
        id: 'q7b', text: 'Community policing and local involvement', textBn: 'সম্প্রদায় পুলিশিং ও স্থানীয় অংশগ্রহণ',
        partyWeights: { AITC: 7, BJP: 6, INC: 7, 'CPI(M)': 8, RSP: 8, SUCI: 7, IND: 7 },
      },
      {
        id: 'q7c', text: 'Fast-track courts for speedy justice', textBn: 'দ্রুত বিচারের জন্য ফাস্ট-ট্র্যাক আদালত',
        partyWeights: { AITC: 6, BJP: 8, INC: 7, 'CPI(M)': 6, RSP: 6, SUCI: 5, IND: 7 },
      },
      {
        id: 'q7d', text: 'Address root causes: poverty and unemployment', textBn: 'মূল কারণ সমাধান: দারিদ্র্য ও বেকারত্ব',
        partyWeights: { AITC: 7, BJP: 5, INC: 7, 'CPI(M)': 9, RSP: 9, SUCI: 9, IND: 7 },
      },
    ],
  },
  {
    id: 'q8',
    category: 'Environment',
    categoryBn: 'পরিবেশ',
    question: 'How should West Bengal balance development with environmental protection?',
    questionBn: 'পশ্চিমবঙ্গ কীভাবে উন্নয়ন ও পরিবেশ সংরক্ষণের ভারসাম্য রক্ষা করবে?',
    options: [
      {
        id: 'q8a', text: 'Strict regulations on industries near forests and rivers', textBn: 'বন ও নদীর কাছে শিল্পে কঠোর নিয়ন্ত্রণ',
        partyWeights: { AITC: 6, BJP: 4, INC: 6, 'CPI(M)': 8, RSP: 8, SUCI: 8, IND: 6 },
      },
      {
        id: 'q8b', text: 'Promote clean energy (solar, wind)', textBn: 'পরিষ্কার জ্বালানি প্রসার (সৌর, বায়ু)',
        partyWeights: { AITC: 7, BJP: 7, INC: 7, 'CPI(M)': 6, RSP: 6, SUCI: 5, IND: 7 },
      },
      {
        id: 'q8c', text: 'Development must not be stopped for environment', textBn: 'পরিবেশের জন্য উন্নয়ন বন্ধ করা উচিত নয়',
        partyWeights: { AITC: 5, BJP: 8, INC: 5, 'CPI(M)': 2, RSP: 2, SUCI: 1, IND: 4 },
      },
      {
        id: 'q8d', text: 'Protect Sundarbans and coastal ecosystem', textBn: 'সুন্দরবন ও উপকূলীয় বাস্তুতন্ত্র রক্ষা',
        partyWeights: { AITC: 7, BJP: 5, INC: 7, 'CPI(M)': 9, RSP: 8, SUCI: 8, IND: 7 },
      },
    ],
  },
  {
    id: 'q9',
    category: 'Governance',
    categoryBn: 'শাসন ব্যবস্থা',
    question: 'What governance reform is most critical for West Bengal?',
    questionBn: 'পশ্চিমবঙ্গের জন্য কোন শাসন সংস্কার সবচেয়ে গুরুত্বপূর্ণ?',
    options: [
      {
        id: 'q9a', text: 'Decentralisation to Panchayats and local bodies', textBn: 'পঞ্চায়েত ও স্থানীয় সংস্থায় ক্ষমতা বিকেন্দ্রীকরণ',
        partyWeights: { AITC: 7, BJP: 6, INC: 8, 'CPI(M)': 9, RSP: 9, SUCI: 8, IND: 7 },
      },
      {
        id: 'q9b', text: 'E-governance and digital public services', textBn: 'ই-গভর্নেন্স ও ডিজিটাল সরকারি সেবা',
        partyWeights: { AITC: 7, BJP: 9, INC: 7, 'CPI(M)': 5, RSP: 4, SUCI: 3, IND: 6 },
      },
      {
        id: 'q9c', text: 'Stricter anti-corruption measures', textBn: 'কঠোর দুর্নীতিবিরোধী ব্যবস্থা',
        partyWeights: { AITC: 5, BJP: 7, INC: 6, 'CPI(M)': 7, RSP: 7, SUCI: 8, IND: 8 },
      },
      {
        id: 'q9d', text: 'Transparent welfare scheme delivery', textBn: 'স্বচ্ছ কল্যাণ প্রকল্প বিতরণ',
        partyWeights: { AITC: 7, BJP: 7, INC: 7, 'CPI(M)': 8, RSP: 7, SUCI: 8, IND: 7 },
      },
    ],
  },
  {
    id: 'q10',
    category: 'Employment',
    categoryBn: 'কর্মসংস্থান',
    question: 'What is the best way to create jobs for youth in West Bengal?',
    questionBn: 'পশ্চিমবঙ্গে যুবকদের জন্য কর্মসংস্থান সৃষ্টির সর্বোত্তম উপায় কী?',
    options: [
      {
        id: 'q10a', text: 'Expand government job recruitment', textBn: 'সরকারি চাকরি নিয়োগ বাড়ানো',
        partyWeights: { AITC: 6, BJP: 5, INC: 6, 'CPI(M)': 8, RSP: 9, SUCI: 9, IND: 6 },
      },
      {
        id: 'q10b', text: 'Incentivise private companies to invest locally', textBn: 'বেসরকারি কোম্পানিকে স্থানীয় বিনিয়োগে উৎসাহিত করা',
        partyWeights: { AITC: 7, BJP: 9, INC: 7, 'CPI(M)': 3, RSP: 3, SUCI: 2, IND: 6 },
      },
      {
        id: 'q10c', text: 'Support entrepreneurship and start-ups', textBn: 'উদ্যোক্তা ও স্টার্টআপ সহায়তা',
        partyWeights: { AITC: 7, BJP: 8, INC: 7, 'CPI(M)': 4, RSP: 4, SUCI: 3, IND: 7 },
      },
      {
        id: 'q10d', text: 'MGNREGS expansion and rural employment guarantee', textBn: 'মনরেগা সম্প্রসারণ ও গ্রামীণ কর্মসংস্থান নিশ্চয়তা',
        partyWeights: { AITC: 7, BJP: 5, INC: 8, 'CPI(M)': 9, RSP: 9, SUCI: 9, IND: 7 },
      },
    ],
  },
];

export function calculateAlignment(
  answers: Array<{ questionId: string; optionId: string }>
): Record<string, number> {
  const partyTotals: Record<string, number> = {};
  const partyMax: Record<string, number> = {};

  for (const answer of answers) {
    const question = quizQuestions.find((q) => q.id === answer.questionId);
    if (!question) continue;
    const option = question.options.find((o) => o.id === answer.optionId);
    if (!option) continue;

    for (const [partyId, weight] of Object.entries(option.partyWeights)) {
      partyTotals[partyId] = (partyTotals[partyId] ?? 0) + weight;
    }
  }

  // Max possible score per party (all 10s, one question per answer)
  const maxPerQuestion = 10;
  const maxTotal = answers.length * maxPerQuestion;

  const scores: Record<string, number> = {};
  for (const [partyId, total] of Object.entries(partyTotals)) {
    scores[partyId] = Math.round((total / maxTotal) * 100);
  }
  return scores;
}
