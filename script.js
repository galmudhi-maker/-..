
const API = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const $ = (id) => document.getElementById(id);

let currentCompound = null;
let viewer = null;
let savedCompounds = JSON.parse(localStorage.getItem("jozaiSaved") || "[]");
let searches = Number(localStorage.getItem("jozaiSearches") || 0);
let comparisons = Number(localStorage.getItem("jozaiComparisons") || 0);

const reactions = [
  {
    title: "تكوين الماء",
    equation: "2H₂ + O₂ → 2H₂O",
    type: "اتحاد",
    reactants: "الهيدروجين والأكسجين",
    products: "الماء",
    explanation: "يتحد الهيدروجين مع الأكسجين لتكوين الماء. المعادلة موزونة؛ إذ تحتوي على أربع ذرات هيدروجين وذرتي أكسجين في كلا الطرفين."
  },
  {
    title: "احتراق الميثان",
    equation: "CH₄ + 2O₂ → CO₂ + 2H₂O",
    type: "احتراق",
    reactants: "الميثان والأكسجين",
    products: "ثاني أكسيد الكربون والماء",
    explanation: "يتفاعل الميثان مع الأكسجين في تفاعل احتراق كامل، وينتج ثاني أكسيد الكربون والماء مع انطلاق طاقة."
  },
  {
    title: "تحلل فوق أكسيد الهيدروجين",
    equation: "2H₂O₂ → 2H₂O + O₂",
    type: "تحلل",
    reactants: "فوق أكسيد الهيدروجين",
    products: "الماء والأكسجين",
    explanation: "يتحلل فوق أكسيد الهيدروجين إلى ماء وغاز الأكسجين. المعادلة موزونة وفق قانون حفظ الكتلة."
  },
  {
    title: "تعادل الحمض والقاعدة",
    equation: "HCl + NaOH → NaCl + H₂O",
    type: "تعادل",
    reactants: "حمض الهيدروكلوريك وهيدروكسيد الصوديوم",
    products: "كلوريد الصوديوم والماء",
    explanation: "يتفاعل الحمض مع القاعدة لينتج ملح وماء. تمثل هذه المعادلة مثالًا شائعًا لتفاعلات التعادل."
  }
];

// ---------------- NAVIGATION ----------------

function showPage(pageName) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("active", page.id === pageName);
  });

  document.querySelectorAll(".nav-link").forEach(link => {
    link.classList.toggle("active", link.dataset.page === pageName);
  });

  $("navigation").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (pageName === "analytics") updateAnalytics();
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.go));
});

$("menuToggle").addEventListener("click", () => {
  $("navigation").classList.toggle("open");
});

// ---------------- TOAST ----------------

let toastTimer;

function toast(message) {
  const box = $("toast");
  box.textContent = message;
  box.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.classList.remove("show");
  }, 2600);
}

// ---------------- FORMULA ANALYSIS ----------------

function formulaStats(formula) {
  const matches = formula.match(/[A-Z][a-z]?\d*/g) || [];
  let atoms = 0;
  const elements = new Set();

  matches.forEach(part => {
    const match = part.match(/^([A-Z][a-z]?)(\d*)$/);
    if (!match) return;

    elements.add(match[1]);
    atoms += Number(match[2] || 1);
  });

  return {
    atoms,
    elements: elements.size
  };
}

// ---------------- PUBCHEM SEARCH ----------------

async function fetchCompound(name) {
  const safeName = encodeURIComponent(name.trim());

  const url =
    `${API}/compound/name/${safeName}/property/` +
    `MolecularFormula,MolecularWeight,IUPACName/JSON`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("لم يتم العثور على المركب. تأكدي من كتابة اسمه باللغة الإنجليزية.");
  }

  const data = await response.json();

  if (!data.PropertyTable || !data.PropertyTable.Properties.length) {
    throw new Error("لا توجد بيانات متاحة لهذا المركب.");
  }

  const item = data.PropertyTable.Properties[0];
  const stats = formulaStats(item.MolecularFormula);

  return {
    cid: item.CID,
    name: name.trim(),
    formula: item.MolecularFormula || "غير متوفر",
    weight: Number(item.MolecularWeight || 0),
    iupac: item.IUPACName || "غير متوفر",
    atoms: stats.atoms,
    elements: stats.elements,
    bonds: null
  };
}

// ---------------- 3D MOLECULAR MODEL ----------------

async function loadMolecule3D(cid) {
  const container = $("moleculeViewer");

  container.innerHTML = "";

  if (viewer) {
    try {
      viewer.clear();
    } catch (e) {}
    viewer = null;
  }

  if (!window.$3Dmol) {
    container.innerHTML =
      '<div class="viewer-placeholder"><span>!</span><p>تعذر تحميل مكتبة العرض ثلاثي الأبعاد.</p></div>';
    return;
  }

  try {
    const url = `${API}/compound/cid/${cid}/record/SDF?record_type=3d`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("لا يتوفر نموذج ثلاثي الأبعاد لهذا المركب.");
    }

    const sdf = await response.text();

    if (!sdf || sdf.length < 20) {
      throw new Error("بيانات النموذج غير مكتملة.");
    }

    viewer = $3Dmol.createViewer(container, {
      backgroundColor: "#102B29",
      antialias: true
    });

    const model = viewer.addModel(sdf, "sdf");

    model.setStyle({}, {
      stick: {
        radius: 0.17,
        colorscheme: "Jmol"
      },
      sphere: {
        scale: 0.27,
        colorscheme: "Jmol"
      }
    });

    viewer.zoomTo();
    viewer.zoom(0.85);
    viewer.render();

    const atoms = model.selectedAtoms({});
    let bonds = 0;

    atoms.forEach(atom => {
      bonds += (atom.bonds || []).length;
    });

    const bondCount = Math.round(bonds / 2);

    if (currentCompound && currentCompound.cid === cid) {
      currentCompound.atoms = atoms.length || currentCompound.atoms;
      currentCompound.bonds = bondCount || null;

      $("compoundAtoms").textContent = currentCompound.atoms;
      $("compoundBonds").textContent =
        currentCompound.bonds === null ? "—" : currentCompound.bonds;
    }

  } catch (error) {
    container.innerHTML =
      '<div class="viewer-placeholder"><span>◇</span><p>لا يتوفر نموذج ثلاثي الأبعاد لهذا المركب حاليًا.</p></div>';
  }
}

// ---------------- DISPLAY COMPOUND ----------------

function displayCompound(compound) {
  currentCompound = compound;

  $("compoundResult").classList.remove("hidden");

  $("compoundName").textContent = compound.name;
  $("compoundIupac").textContent = compound.iupac;
  $("compoundFormula").textContent = compound.formula;
  $("compoundWeight").textContent =
    compound.weight ? compound.weight.toFixed(3) : "—";
  $("compoundCID").textContent = compound.cid;
  $("compoundAtoms").textContent = compound.atoms;
  $("compoundBonds").textContent = "جارٍ التحميل";

  $("detailFormula").textContent = compound.formula;
  $("detailWeight").textContent =
    compound.weight ? compound.weight.toFixed(3) + " g/mol" : "—";
  $("detailIupac").textContent = compound.iupac;

  loadMolecule3D(compound.cid);
}

// ---------------- SEARCH ACTION ----------------

async function searchCompound(name) {
  if (!name.trim()) {
    $("searchMessage").textContent = "اكتبي اسم المركب أولًا.";
    $("searchMessage").className = "message-area error";
    return;
  }

  $("searchBtn").disabled = true;
  $("searchBtn").textContent = "جارٍ البحث...";
  $("searchMessage").textContent = "يتم الآن جلب البيانات الكيميائية...";
  $("searchMessage").className = "message-area";

  try {
    const compound = await fetchCompound(name);

    searches++;
    localStorage.setItem("jozaiSearches", searches);

    displayCompound(compound);

    $("searchMessage").textContent = "تم العثور على المركب بنجاح.";
    $("searchMessage").className = "message-area success";

  } catch (error) {
    $("compoundResult").classList.add("hidden");
    $("searchMessage").textContent =
      error.message || "حدث خطأ أثناء البحث.";
    $("searchMessage").className = "message-area error";

  } finally {
    $("searchBtn").disabled = false;
    $("searchBtn").textContent = "بحث";
  }
}

$("searchBtn").addEventListener("click", () => {
  searchCompound($("compoundSearch").value);
});

$("compoundSearch").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    searchCompound($("compoundSearch").value);
  }
});

document.querySelectorAll("[data-search]").forEach(button => {
  button.addEventListener("click", () => {
    $("compoundSearch").value = button.dataset.search;
    searchCompound(button.dataset.search);
  });
});

// ---------------- SAVE COMPOUND ----------------

$("saveCompound").addEventListener("click", () => {
  if (!currentCompound) {
    toast("ابحثي عن مركب أولًا.");
    return;
  }

  const exists = savedCompounds.some(
    item => item.cid === currentCompound.cid
  );

  if (exists) {
    toast("هذا المركب موجود في سجلك بالفعل.");
    return;
  }

  savedCompounds.push({
    cid: currentCompound.cid,
    name: currentCompound.name,
    formula: currentCompound.formula,
    weight: currentCompound.weight,
    date: new Date().toLocaleDateString("ar-SA")
  });

  localStorage.setItem("jozaiSaved", JSON.stringify(savedCompounds));

  toast("تمت إضافة المركب إلى سجل الاستكشاف.");
});

// ---------------- COMPARISON ----------------

async function compareCompounds() {
  const firstName = $("compareOne").value.trim();
  const secondName = $("compareTwo").value.trim();

  if (!firstName || !secondName) {
    $("compareMessage").textContent = "أدخلي اسمي المركبين.";
    $("compareMessage").className = "message-area error";
    return;
  }

  if (firstName.toLowerCase() === secondName.toLowerCase()) {
    $("compareMessage").textContent = "اختاري مركبين مختلفين للمقارنة.";
    $("compareMessage").className = "message-area error";
    return;
  }

  $("compareBtn").disabled = true;
  $("compareBtn").textContent = "جارٍ تحليل البيانات...";
  $("compareMessage").textContent = "يتم جلب بيانات المركبين...";
  $("compareMessage").className = "message-area";

  try {
    const [one, two] = await Promise.all([
      fetchCompound(firstName),
      fetchCompound(secondName)
    ]);

    comparisons++;
    localStorage.setItem("jozaiComparisons", comparisons);

    $("compareNameOne").textContent = one.name;
    $("compareNameTwo").textContent = two.name;

    $("compareFormulaOne").textContent = one.formula;
    $("compareFormulaTwo").textContent = two.formula;

    $("compareWeightOne").textContent =
      one.weight.toFixed(3);
    $("compareWeightTwo").textContent =
      two.weight.toFixed(3);

    $("compareAtomsOne").textContent = one.atoms;
    $("compareAtomsTwo").textContent = two.atoms;

    $("compareBondsOne").textContent = "غير متاح";
    $("compareBondsTwo").textContent = "غير متاح";

    $("compareElementsOne").textContent = one.elements;
    $("compareElementsTwo").textContent = two.elements;

    let insight = "";

    if (one.formula === two.formula) {
      insight += "يمتلك المركبان الصيغة الجزيئية نفسها. ";
      insight += "لكن تشابه الصيغة وحده لا يثبت أن لهما البنية أو الخصائص نفسها. ";
    } else {
      insight += "يختلف المركبان في الصيغة الجزيئية، وهذا يعني اختلافًا في تركيب الذرات أو أعدادها. ";
    }

    if (one.weight > two.weight) {
      insight += `${one.name} يمتلك كتلة مولية أكبر من ${two.name}. `;
    } else if (one.weight < two.weight) {
      insight += `${two.name} يمتلك كتلة مولية أكبر من ${one.name}. `;
    } else {
      insight += "الكتلتان الموليتان متساويتان تقريبًا. ";
    }

    insight += `يحتوي المركب الأول على ${one.atoms} ذرة وفق صيغته، والثاني على ${two.atoms} ذرة.`;

    $("comparisonInsight").textContent = insight;
    $("compareResult").classList.remove("hidden");

    $("compareMessage").textContent = "اكتملت مقارنة البيانات المتاحة.";
    $("compareMessage").className = "message-area success";

  } catch (error) {
    $("compareResult").classList.add("hidden");
    $("compareMessage").textContent =
      error.message || "تعذر إكمال المقارنة.";
    $("compareMessage").className = "message-area error";

  } finally {
    $("compareBtn").disabled = false;
    $("compareBtn").textContent = "ابدأ المقارنة ←";
  }
}

$("compareBtn").addEventListener("click", compareCompounds);

// ---------------- REACTION LAB ----------------

function showReaction(index) {
  const reaction = reactions[index];

  if (!reaction) return;

  document.querySelectorAll(".reaction-option").forEach(button => {
    button.classList.toggle(
      "active",
      Number(button.dataset.reaction) === index
    );
  });

  $("reactionTitle").textContent = reaction.title;
  $("reactionEquation").textContent = reaction.equation;
  $("reactionType").textContent = reaction.type;
  $("reactionReactants").textContent = reaction.reactants;
  $("reactionProducts").textContent = reaction.products;
  $("reactionExplanation").textContent = reaction.explanation;
  $("balanceText").textContent =
    "المعادلة المعروضة موزونة وفق قانون حفظ الكتلة.";
}

document.querySelectorAll("[data-reaction]").forEach(button => {
  button.addEventListener("click", () => {
    showReaction(Number(button.dataset.reaction));
  });
});

// ---------------- ANALYTICS ----------------

function updateAnalytics() {
  $("statSaved").textContent = savedCompounds.length;
  $("statSearches").textContent = searches;
  $("statComparisons").textContent = comparisons;

  const history = $("historyList");

  if (!savedCompounds.length) {
    history.innerHTML =
      '<div class="empty-state">لم تتم إضافة مركبات بعد. اذهبي إلى مستكشف المركبات وابدئي الاستكشاف.</div>';
    return;
  }

  history.innerHTML = "";

  [...savedCompounds].reverse().forEach(compound => {
    const item = document.createElement("div");
    item.className = "history-item";

    const info = document.createElement("div");
    const name = document.createElement("strong");
    const date = document.createElement("small");

    name.textContent = compound.name;
    date.textContent = compound.date;

    info.appendChild(name);
    info.appendChild(date);

    const formula = document.createElement("span");
    formula.className = "history-formula";
    formula.textContent = compound.formula;

    item.appendChild(info);
    item.appendChild(formula);

    history.appendChild(item);
  });
}

$("clearHistory").addEventListener("click", () => {
  if (!savedCompounds.length) {
    toast("السجل فارغ بالفعل.");
    return;
  }

  const confirmed = confirm("هل تريدين مسح سجل المركبات المحفوظة؟");

  if (!confirmed) return;

  savedCompounds = [];
  localStorage.setItem("jozaiSaved", JSON.stringify(savedCompounds));

  updateAnalytics();
  toast("تم مسح سجل الاستكشاف.");
});

// ---------------- INITIALIZE ----------------

updateAnalytics();
showReaction(0);
