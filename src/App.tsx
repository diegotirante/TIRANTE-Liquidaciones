/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { 
  Building2, 
  Calculator, 
  Users, 
  MapPin, 
  Phone, 
  ClipboardList,
  Save,
  CheckSquare,
  History,
  TrendingDown,
  LayoutDashboard,
  Wallet,
  ArrowDownCircle,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Trash2,
  Target,
  RotateCcw,
  Database,
  Download,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
type CaptationSource = 'PROPIA' | 'OFICINA';

interface SavedLiquidation {
  id: string;
  opNumber: string;
  propertyCode: string;
  date: string;
  type: 'VENTA' | 'ALQUILER';
  agentName: string;
  agent2Name?: string;
  totalAgencyUSD: number;
  agent1CommissionUSD: number;
  agent2CommissionUSD?: number;
  officeNetUSD: number;
  socioUSD: number;
  gerenteUSD: number;
  cajaOficinaUSD: number;
  cleaningUSD: number;
  invoiced: boolean;
  snapshot: any; // All calculation inputs to regenerate PDF
}

interface Withdrawal {
  id: string;
  boxId: string;
  amountUSD: number;
  date: string;
  recipient: string;
  performedBy: string;
}

// --- Components ---

const LiquidationEngine = () => {
  const [activeTab, setActiveTab] = useState<'VENTA' | 'ALQUILER'>('ALQUILER');
  const [opAmount, setOpAmount] = useState<number>(0);
  const [source, setSource] = useState<CaptationSource>('PROPIA');
  
  // Office Only Mode
  const [isOfficeOnly, setIsOfficeOnly] = useState<boolean>(false);
  
  // PDF & Data Fields
  const [agentName, setAgentName] = useState<string>('Oficina Central');
  const [opNumber, setOpNumber] = useState<string>('OP-0001');
  const [propertyCode, setPropertyCode] = useState<string>('DT| ');
  
  // Currency Conversion
  const [isPesos, setIsPesos] = useState<boolean>(false);
  const [exchangeRate, setExchangeRate] = useState<number>(1050);
 
  // States for Rentals
  const [cleaningGastos, setCleaningGastos] = useState<number>(0);
  const [coAgentName, setCoAgentName] = useState<string>('');
  
  // States for Sales
  const [saleMode, setSaleMode] = useState<'LIBRE' | 'COMPARTIDO'>('COMPARTIDO');
  const [commVendedorPct, setCommVendedorPct] = useState<number>(4);
  const [commCompradorPct, setCommCompradorPct] = useState<number>(4);
  const [escrituraPct, setEscrituraPct] = useState<number>(3.6);
  const [parcelario, setParcelario] = useState<number>(0);
  const [inhibicion, setInhibicion] = useState<number>(0);
  const [valorDeclarar, setValorDeclarar] = useState<number>(0);

  const [isTracto, setIsTracto] = useState<boolean>(false);
  const [notaryFeePct, setNotaryFeePct] = useState<number>(2);
  const [itiPct, setItiPct] = useState<number>(1.5);
  const [tasaTractoPct, setTasaTractoPct] = useState<number>(0.5);
  const [certificadosMonto, setCertificadosMonto] = useState<number>(150);
  const [inscripcionMonto, setInscripcionMonto] = useState<number>(100);
  const [hasDeudas, setHasDeudas] = useState<boolean>(false);
  const [deudasMonto, setDeudasMonto] = useState<number>(0);
  const [reservaMonto, setReservaMonto] = useState<number>(0);
  const [reservaFecha, setReservaFecha] = useState<string>('');
  
  const [isCompartida, setIsCompartida] = useState<boolean>(false);
  const [coAgencyName, setCoAgencyName] = useState<string>('');
  const [shareBuyer, setShareBuyer] = useState<boolean>(false);
  const [shareSeller, setShareSeller] = useState<boolean>(false);

  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [resultsView, setResultsView] = useState<'OPERACION' | 'HONORARIOS'>('OPERACION');
  const [isFacturado, setIsFacturado] = useState<boolean>(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<boolean>(false);
  
  // Dashboard & persistence
  const [savedLiquidations, setSavedLiquidations] = useState<SavedLiquidation[]>(() => {
    try {
      const saved = localStorage.getItem('tirante_liquidations');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Error loading liquidations", e);
      return [];
    }
  });
  
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>(() => {
    try {
      const saved = localStorage.getItem('tirante_withdrawals');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Error loading withdrawals", e);
      return [];
    }
  });

  const [showDashboard, setShowDashboard] = useState<boolean>(false);
  const [activeBox, setActiveBox] = useState<string | null>(null);

  // Auto-save to localStorage
  React.useEffect(() => {
    localStorage.setItem('tirante_liquidations', JSON.stringify(savedLiquidations));
  }, [savedLiquidations]);

  React.useEffect(() => {
    localStorage.setItem('tirante_withdrawals', JSON.stringify(withdrawals));
  }, [withdrawals]);

  const handleSaveLiquidation = () => {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : `liq-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    let agent2Val = undefined;
    let agent2Nm = undefined;

    if (activeTab === 'VENTA') {
      if (coAgencyName === 'AGENTE OFICINA') {
        agent2Val = results.agent2;
        agent2Nm = coAgentName;
      } else if (isCompartida && coAgencyName) {
        // En ventas compartidas con externas, si el usuario quiere trackearlo en caja
        // Cargamos el monto cedido como deuda de agente a liquidar
        agent2Val = results.externalShareAmount || 0;
        agent2Nm = coAgencyName;
      }
    } else {
      // Alquiler
      if (coAgentName) {
        agent2Val = results.agent2 || 0; // Necesitamos asegurar que results tenga agent2 en alquiler si aplica
        agent2Nm = coAgentName;
      }
    }

    const newLiq: SavedLiquidation = {
      id,
      opNumber: opNumber || `OP-${Date.now().toString().slice(-4)}`,
      propertyCode: propertyCode,
      date: new Date().toISOString(),
      type: activeTab,
      agentName: agentName,
      agent2Name: agent2Nm,
      totalAgencyUSD: results.totalAgency,
      agent1CommissionUSD: results.agent,
      agent2CommissionUSD: agent2Val,
      officeNetUSD: results.officeNet,
      socioUSD: results.socio,
      gerenteUSD: results.gerente,
      cajaOficinaUSD: results.cajaOficina,
      cleaningUSD: activeTab === 'ALQUILER' ? cleaningGastos : 0,
      invoiced: isFacturado,
      snapshot: {
        activeTab, opAmount, opNumber, propertyCode, agentName, results, isPesos, exchangeRate,
        cleaningGastos, valorDeclarar, reservaMonto, reservaFecha, commCompradorPct,
        commVendedorPct, notaryFeePct, saleMode, escrituraPct, itiPct, isTracto,
        tasaTractoPct, certificadosMonto, inscripcionMonto, hasDeudas, deudasMonto,
        isCompartida, coAgencyName, coAgentName, shareBuyer, shareSeller,
        isOfficeOnly, date: new Date().toLocaleDateString()
      }
    };

    setSavedLiquidations(prev => [newLiq, ...prev]);
    
    // Auto Increment & Reset
    const match = opNumber.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[0]);
      const newNum = (num + 1).toString().padStart(match[0].length, '0');
      setOpNumber(opNumber.replace(match[0], newNum));
    }
    
    setOpAmount(0);
    setValorDeclarar(0);
    setCleaningGastos(0);
    setReservaMonto(0);
    setReservaFecha('');
    setDeudasMonto(0);
    setHasDeudas(false);
    setIsCompartida(false);
    setIsFacturado(false);
    setCoAgencyName('');
    setCoAgentName('');
    setShareBuyer(false);
    setShareSeller(false);
    setPropertyCode('DT| ');

    alert('Liquidación guardada y valores reseteados.');
  };

  const deleteLiquidation = (id: string) => {
    if (!id) return;
    const confirmDelete = window.confirm('¿Está seguro de eliminar esta operación? Esto afectará todos los saldos de las cajas de forma permanente.');
    if (confirmDelete) {
      setSavedLiquidations(prev => {
        const newState = prev.filter(l => l.id !== id);
        // Force sync with localStorage just in case to ensure persistence
        localStorage.setItem('tirante_liquidations', JSON.stringify(newState));
        return newState;
      });
    }
  };

  const resetSystem = () => {
    if (window.confirm('⚠️ ATENCIÓN: Esta acción ELIMINARÁ TODOS los registros, retiros e historial de forma PERMANENTE como si la oficina recién empezara. ¿Desea continuar?')) {
      setSavedLiquidations([]);
      setWithdrawals([]);
      localStorage.removeItem('tirante_liquidations');
      localStorage.removeItem('tirante_withdrawals');
      
      // Reset current form
      setOpNumber('OP-0001');
      setOpAmount(0);
      setValorDeclarar(0);
      setPropertyCode('DT| ');
      setCleaningGastos(0);
      setAgentName('Oficina Central');
      
      alert('Sistema reiniciado. Todos los valores están en cero.');
    }
  };

  const handleWithdrawal = (boxId: string) => {
    const amount = prompt(`REGISTRO DE RETIRO - ${boxId}\n\nIngrese el VALOR (USD):`);
    if (!amount || isNaN(Number(amount))) return;

    const recipient = prompt("A QUIEN SE LE PAGA:");
    if (!recipient) return;

    const performedBy = prompt("QUIEN REALIZA EL PAGO:", agentName);
    if (!performedBy) return;

    const newWithdrawal: Withdrawal = {
      id: `RET-${Date.now().toString().slice(-6)}`,
      boxId,
      amountUSD: Number(amount),
      date: new Date().toISOString(),
      recipient,
      performedBy
    };

    setWithdrawals(prev => [...prev, newWithdrawal]);
    alert(`Retiro Registrado:\nID: ${newWithdrawal.id}\nValor: ${formatCurrency(newWithdrawal.amountUSD)}\nDestino: ${recipient}`);
  };

  const getBoxTotal = (boxId: string) => {
    let total = 0;
    savedLiquidations.forEach(l => {
      // Robust sum including legacy field handling
      if (boxId === 'Agente') {
        const a1 = (l as any).agent1CommissionUSD || (l as any).agentCommissionUSD || 0;
        const a2 = l.agent2CommissionUSD || 0;
        total += (a1 + a2);
      }
      if (boxId === 'Oficina') total += (l.officeNetUSD || 0);
      if (boxId === 'Socio') total += (l.socioUSD || 0);
      if (boxId === 'Gerente') total += (l.gerenteUSD || 0);
      if (boxId === 'Caja Total') total += (l.cajaOficinaUSD || 0);
      if (boxId === 'Limpieza') total += (l.cleaningUSD || 0);
    });

    const withdrawn = withdrawals
      .filter(w => w.boxId === boxId)
      .reduce((sum, w) => sum + (w.amountUSD || 0), 0);

    return total - withdrawn;
  };

  const formatCurrency = (val: number) => {
    // Round to avoid decimals as requested
    const amount = Math.round(isPesos ? val * exchangeRate : val);
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: isPesos ? 'ARS' : 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const results = useMemo(() => {
    if (activeTab === 'ALQUILER') {
      // Logic from user: inquilino pays opAmount (inclusive)
      // opAmount - Cleaning = RentBase (Vd) + 10% Inq
      // opAmount - Cleaning = 1.1 * RentBase
      // RentBase (Vd) = (opAmount - Cleaning) / 1.1
      const rentBase = (opAmount - cleaningGastos) / 1.1;
      const commInquilino = rentBase * 0.10;
      const commPropietario = rentBase * 0.10;
      const subTotalLiquidacion = rentBase; // This is the "Valor Declarado"
      const totalAgency = commInquilino + commPropietario;
      const propietarioRecibe = rentBase * 0.90; // RentBase - 10% Prop

      if (isOfficeOnly) {
        const socio = totalAgency * 0.25;
        const gerente = totalAgency * 0.25;
        const cajaOficina = totalAgency * 0.50;
        const gastosOficina = cajaOficina * 0.75;

        return { 
          type: 'ALQUILER',
          commInquilino, subTotalLiquidacion, commPropietario, totalAgency, propietarioRecibe,
          agent: 0, martillero: 0, captador: 0, officeNet: totalAgency, socio, gerente, cajaOficina, gastosOficina,
          agentPct: 0, officePct: 1, isOfficeOnly: true
        };
      }

      const agentPct = source === 'PROPIA' ? 0.30 : 0.25;
      const officePct = source === 'PROPIA' ? 0.70 : 0.75; // Increased by 7% (5% Martillero + 2% Captador removed)
      
      const totalAgentComm = totalAgency * agentPct;
      let agent1 = totalAgentComm;
      let agent2 = 0;

      if (coAgentName) {
        agent1 = totalAgentComm / 2;
        agent2 = totalAgentComm / 2;
      }

      const officeNet = totalAgency * officePct;

      const socio = officeNet * 0.25;
      const gerente = officeNet * 0.25;
      const cajaOficina = officeNet * 0.50;
      const gastosOficina = cajaOficina * 0.75;
      const inversionOficina = cajaOficina * 0.25;

      return { 
        type: 'ALQUILER',
        commInquilino, subTotalLiquidacion, commPropietario, totalAgency, propietarioRecibe,
        agent: agent1, agent2, martillero: 0, captador: 0, officeNet, socio, gerente, cajaOficina, gastosOficina, inversionOficina,
        agentPct, officePct, isOfficeOnly: false
      };
    } else {
      let rawCommVendedor = opAmount * (commVendedorPct / 100);
      let rawCommComprador = opAmount * (commCompradorPct / 100);

      const isInternalShare = coAgencyName === 'AGENTE OFICINA';
      
      // Share Logic: 
      // If external share (NOT Agente Oficina), agency keeps 0% of that "side" (cede 100%)
      // If internal share (Agente Oficina), agency keeps 100% (cede 0%) but we split agent comm later
      let commVendedorAgencia = rawCommVendedor;
      if (shareSeller && !isInternalShare) {
        commVendedorAgencia = 0;
      }

      let commCompradorAgencia = rawCommComprador;
      if (shareBuyer && !isInternalShare) {
        commCompradorAgencia = 0;
      }

      // Logic: If internal share, the agent who "brings" that side keeps the commission %
      // Agent 1 keeps sides not shared. Agent 2 gets sides shared internally.
      
      const totalAgency = commCompradorAgencia + commVendedorAgencia;
      
      // --- Notary/Escritura Engineering (Calculated on valorDeclarar) ---
      const baseCalc = valorDeclarar > 0 ? valorDeclarar : opAmount;
      const sellosTotal = baseCalc * (escrituraPct / 100);
      const sellosVendedor = sellosTotal / 2;
      const sellosComprador = sellosTotal / 2;
      
      const iti = baseCalc * (itiPct / 100);
      const honorariosEscribano = baseCalc * (notaryFeePct / 100);
      const tasaTracto = isTracto ? baseCalc * (tasaTractoPct / 100) : 0;
      const sucesionJudicial = isTracto ? baseCalc * 0.04 : 0; // 3-5% additional estimate
      
      const sellerClosingExpenses = iti + certificadosMonto + sucesionJudicial + tasaTracto + parcelario + (hasDeudas ? deudasMonto : 0);
      const buyerClosingExpenses = honorariosEscribano + inscripcionMonto;

      const totalGastosVendedor = saleMode === 'LIBRE' ? 0 : (sellosVendedor + sellerClosingExpenses);
      const totalGastosComprador = saleMode === 'LIBRE' ? (sellosTotal + buyerClosingExpenses + sellerClosingExpenses) : (sellosComprador + buyerClosingExpenses);
      
      const totalOperacion = opAmount + rawCommComprador + totalGastosComprador - reservaMonto;
      const vendedorRecibe = opAmount - rawCommVendedor - totalGastosVendedor;

      if (isOfficeOnly) {
        const socio = totalAgency * 0.25;
        const gerente = totalAgency * 0.25;
        const cajaOficina = totalAgency * 0.50;

        return { 
          type: 'VENTA',
          commComprador: rawCommComprador, 
          commVendedor: rawCommVendedor,
          totalAgency, totalOperacion, vendedorRecibe, 
          iti, certificadosMonto, sucesionJudicial, sellosVendedor, sellosComprador, 
          honorariosEscribano, inscripcionMonto, totalGastosVendedor, totalGastosComprador,
          tasaTracto, parcelario, deudasMonto, reservaMonto, reservaFecha,
          agent: 0, martillero: 0, captador: 0, officeNet: totalAgency, socio, gerente, cajaOficina,
          agentPct: 0, officePct: 1, isOfficeOnly: true
        };
      }

      const agentPct = source === 'PROPIA' ? 0.30 : 0.25;
      const officePct = source === 'PROPIA' ? 0.70 : 0.75; // Increased by 7% (5%+2% Martillero/Captador)
      
      // Agent Calculation adjusting for internal shares
      let agent1Share = 0;
      let agent2Share = 0;

      // Logic: If internal share, the agent who "brings" that side keeps the commission %
      // Agent 1 keeps sides not shared. Agent 2 gets sides shared internally.
      
      let commPoolComprador = commCompradorAgencia * agentPct;
      if (shareBuyer && isInternalShare) {
        agent2Share += commPoolComprador;
      } else if (!shareBuyer) {
        agent1Share += commPoolComprador;
      }

      let commPoolVendedor = commVendedorAgencia * agentPct;
      if (shareSeller && isInternalShare) {
        agent2Share += commPoolVendedor;
      } else if (!shareSeller) {
        agent1Share += commPoolVendedor;
      }

      const agent = agent1Share;
      const officeNet = totalAgency * officePct;

      const socio = officeNet * 0.25;
      const gerente = officeNet * 0.25;
      const cajaOficina = officeNet * 0.50;

      // External share value (what we ceded)
      let externalShareAmount = 0;
      if (shareBuyer && !isInternalShare) externalShareAmount += rawCommComprador;
      if (shareSeller && !isInternalShare) externalShareAmount += rawCommVendedor;

      return { 
        type: 'VENTA',
        commComprador: rawCommComprador,
        commVendedor: rawCommVendedor, 
        totalAgency, totalOperacion, vendedorRecibe, 
        iti, certificadosMonto, sucesionJudicial, sellosVendedor, sellosComprador, 
        honorariosEscribano, inscripcionMonto, totalGastosVendedor, totalGastosComprador,
        tasaTracto, parcelario, deudasMonto, reservaMonto, reservaFecha,
        agent, agent2: agent2Share, martillero: 0, captador: 0, externalShareAmount,
        officeNet, socio, gerente, cajaOficina,
        agentPct, officePct, isOfficeOnly: false
      };
    }
  }, [activeTab, opAmount, source, cleaningGastos, saleMode, commVendedorPct, commCompradorPct, escrituraPct, parcelario, inhibicion, isTracto, notaryFeePct, itiPct, certificadosMonto, inscripcionMonto, isOfficeOnly, shareBuyer, shareSeller, valorDeclarar, deudasMonto, hasDeudas, tasaTractoPct, coAgencyName, reservaMonto, reservaFecha]);

  const generatePDF = (historyItem?: SavedLiquidation) => {
    const doc = new jsPDF();
    
    // Determine source data (history or current state)
    const context = historyItem ? historyItem.snapshot : {
      activeTab, opAmount, opNumber, agentName, results, isPesos, exchangeRate,
      cleaningGastos, valorDeclarar, reservaMonto, reservaFecha, commCompradorPct,
      commVendedorPct, notaryFeePct, saleMode, escrituraPct, itiPct, isTracto,
      tasaTractoPct, certificadosMonto, inscripcionMonto, hasDeudas, deudasMonto,
      isCompartida, coAgencyName, coAgentName, shareBuyer, shareSeller,
      isOfficeOnly, date: new Date().toLocaleDateString()
    };

    const date = context.date || new Date().toLocaleDateString();
    
    const addHeader = (p_doc: jsPDF) => {
      // Header background White
      p_doc.setFillColor(255, 255, 255);
      p_doc.rect(0, 0, 210, 40, 'F');
      
      p_doc.setTextColor(0, 0, 0);
      p_doc.setFontSize(26);
      p_doc.setFont('helvetica', 'bold');
      p_doc.text('TIRANTE', 15, 22);
      
      // Separate ®
      p_doc.setFontSize(14);
      p_doc.setFont('helvetica', 'normal');
      p_doc.text('®', 63, 20); // Positioned next to TIRANTE
      
      // Vertical Red Separator Line
      p_doc.setLineWidth(0.8);
      p_doc.setDrawColor(212, 32, 35); // Rojo Carmesí #D42023
      p_doc.line(72, 13, 72, 26);
      
      // Slogan in Black
      p_doc.setTextColor(0, 0, 0);
      p_doc.setFontSize(16);
      p_doc.setFont('helvetica', 'normal');
      p_doc.text('Bienes Raices.', 78, 22);
      
      p_doc.setTextColor(10, 31, 68); // Navy Blue
      p_doc.setFontSize(8.5);
      p_doc.text('Oficina Pinamar: Martillero Diego A. Tirante', 15, 34);
      
      // Labels in Navy Blue
      p_doc.setFontSize(9);
      p_doc.text(`LIQUIDACIÓN: ${context.opNumber}`, 150, 15);
      p_doc.text(`PROPIEDAD: ${context.propertyCode}`, 150, 22);
      p_doc.text(`FECHA: ${date}`, 150, 29);
      p_doc.text(`AGENTE: ${context.agentName.toUpperCase()}`, 150, 36);
    };

    addHeader(doc);

    // Helper to format currency inside PDF using context
    const pdfFormat = (val: number) => {
      const amount = Math.round(context.isPesos ? val * context.exchangeRate : val);
      return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: context.isPesos ? 'ARS' : 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
    };

    // Body Title
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text(`INFORME DE LIQUIDACIÓN - ${context.activeTab === 'ALQUILER' ? 'ALQUILER TEMPORAL' : 'VENTA INMOBILIARIA'}`, 15, 55);
    
    // Summary Table
    const summaryData = [
      [context.activeTab === 'ALQUILER' ? 'Monto Total Operación (Inclusive)' : 'Monto Real de Venta', pdfFormat(context.opAmount)],
    ];

    if (context.activeTab === 'VENTA') {
      summaryData.push(['Valor a Declarar', pdfFormat(context.valorDeclarar)]);
    }

    if (context.activeTab === 'VENTA' && context.reservaMonto > 0) {
      summaryData.push(['(-) SEÑA DE RESERVA RECIBIDA', `-${pdfFormat(context.reservaMonto)}`]);
      const restaAbonar = context.results.totalAgency - context.reservaMonto;
      if (restaAbonar > 0) {
        summaryData.push(['RESTA ABONAR COMISIÓN INMOBILIARIA', pdfFormat(restaAbonar)]);
      } else {
        summaryData.push(['COMISIÓN TOTALMENTE CUBIERTA', 'Saldado']);
      }
    }

    summaryData.push(
      ['Comisión Comprador/Inquilino', pdfFormat(context.activeTab === 'ALQUILER' ? context.results.commInquilino : context.results.commComprador)],
      ['Comisión Vendedor/Propietario', pdfFormat(context.activeTab === 'ALQUILER' ? context.results.commPropietario! : context.results.commVendedor)],
      ['TOTAL COMISIÓN AGENCIA', pdfFormat(context.results.totalAgency)],
      ['-----------------------', '-----------------------'],
      [context.activeTab === 'ALQUILER' ? 'Propietario Recibe' : 'MONTO NETO A RECIBIR (Vendedor)', pdfFormat(context.results.type === 'ALQUILER' ? context.results.propietarioRecibe : context.results.vendedorRecibe)],
      [context.activeTab === 'ALQUILER' ? 'Precio de la Publicación' : 'MONTO TOTAL A ENTREGAR (Comprador)', pdfFormat(context.activeTab === 'ALQUILER' ? context.opAmount : context.results.totalOperacion)],
    );

    autoTable(doc, {
      startY: 65,
      head: [['Concepto', 'Valor']],
      body: summaryData,
      theme: 'striped',
      headStyles: { fillColor: [10, 31, 68] } // Navy Blue #0A1F44
    });

    if (context.activeTab === 'ALQUILER') {
       const finalYTable = (doc as any).lastAutoTable.finalY || 100;
       doc.setFontSize(12);
       doc.text('INGENIERÍA DE LA OPERACIÓN (DESGLOSE)', 15, finalYTable + 10);
       
       const alqData = [
         ['VALOR PUBLIACIÓN (Total p/Inquilino)', pdfFormat(context.opAmount)],
         ['----------------------------', '----------------------------'],
         ['Valor Alquiler (Declarado)', pdfFormat(context.results.type === 'ALQUILER' ? context.results.subTotalLiquidacion : 0)],
         ['Comisión Inquilino (10%)', pdfFormat(context.results.type === 'ALQUILER' ? context.results.commInquilino : 0)],
         ['Fondo de Limpieza', pdfFormat(context.cleaningGastos)],
         ['----------------------------', '----------------------------'],
         ['DESGLOSE PARA PROPIETARIO', ''],
         ['Monto Cobrado a Inquilino', pdfFormat(context.opAmount)],
         ['(-) Fondo de Limpieza', `-${pdfFormat(context.cleaningGastos)}`],
         ['(-) Comisión Inquilino (10%)', `-${pdfFormat(context.results.type === 'ALQUILER' ? context.results.commInquilino : 0)}`],
         ['VALOR ALQUILER CONTRATO', pdfFormat(context.results.type === 'ALQUILER' ? context.results.subTotalLiquidacion : 0)],
         ['(-) Comisión Propietario (10%)', `-${pdfFormat(context.results.type === 'ALQUILER' ? context.results.commPropietario : 0)}`],
         ['SALDO NETO A LIQUIDAR', pdfFormat(context.results.type === 'ALQUILER' ? context.results.propietarioRecibe : 0)],
       ];

       autoTable(doc, {
         startY: finalYTable + 15,
         head: [['Concepto Técnico', 'Monto']],
         body: alqData,
         theme: 'grid',
         headStyles: { fillColor: [20, 36, 69] }
       });
    }

    if (context.activeTab === 'VENTA') {
       const finalYTable = (doc as any).lastAutoTable.finalY || 100;
       doc.text('SIMULACIÓN DE GASTOS DE ESCRITURACIÓN', 15, finalYTable + 10);
       
       const notaryData = [
         ['DETALLE DE CIERRE - COMPRADOR', ''],
         ['Precio de Venta del Inmueble', pdfFormat(context.opAmount)],
         [`Comisión Inmobiliaria (${context.commCompradorPct}%)`, pdfFormat(context.results.commComprador)],
         [`Impuesto de Sellos (${(context.saleMode === 'COMPARTIDO' ? context.escrituraPct / 2 : context.escrituraPct).toFixed(1)}%)`, pdfFormat(context.results.sellosComprador)],
         [`Honorarios Escribanía (${context.notaryFeePct}%)`, pdfFormat(context.results.honorariosEscribano)],
         ['Tasas, Certificados e Inscripción', pdfFormat(context.results.inscripcionMonto)],
         ...(context.saleMode === 'LIBRE' ? [
            ['Aportes Vendedor (Asumidos)', pdfFormat(context.results.iti + context.results.certificadosMonto + context.results.parcelario + context.results.sucesionJudicial + context.results.tasaTracto + (context.hasDeudas ? context.deudasMonto : 0))]
         ] : []),
         ['TOTAL A ENTREGAR POR COMPRADOR', pdfFormat(context.results.totalOperacion)],
         ...(context.reservaMonto > 0 ? [
            [`(-) SEÑA DE RESERVA (${context.reservaFecha})`, `-${pdfFormat(context.reservaMonto)}`]
         ] : []),
         ['', ''],
         ['DETALLE DE CIERRE - VENDEDOR', ''],
         ['Precio de Venta del Inmueble', pdfFormat(context.opAmount)],
         [`Comisión Inmobiliaria (${context.commVendedorPct}%)`, `-${pdfFormat(context.results.commVendedor)}`],
         ...(context.saleMode === 'LIBRE' ? [['Gastos Título (Transferidos p/Comprador)', '0']] : [
            ...(context.saleMode === 'COMPARTIDO' ? [[`Impuesto de Sellos (${(context.escrituraPct / 2).toFixed(1)}%)`, `-${pdfFormat(context.results.sellosVendedor)}`]] : []),
            [`ITI / Ganancias (${context.itiPct}%)`, `-${pdfFormat(context.results.iti)}`],
            ['Diligenciamientos/Certif. Ley', `-${pdfFormat(context.results.certificadosMonto)}`],
            ['Estado Parcelario (Agrimensura)', `-${pdfFormat(context.results.parcelario)}`],
            ...(context.isTracto ? [[`Tasa Tracto (${context.tasaTractoPct}%)`, `-${pdfFormat(context.results.tasaTracto)}`], ['Honorarios Sucesión / Gastos Jud.', `-${pdfFormat(context.results.sucesionJudicial)}`]] : []),
            ...(context.hasDeudas ? [['Retención Deudas/Impuestos', `-${pdfFormat(context.deudasMonto)}`]] : []),
         ]),
         ['MONTO NETO A RECIBIR POR VENDEDOR', pdfFormat(context.results.vendedorRecibe)],
       ];

       autoTable(doc, {
         startY: finalYTable + 15,
         head: [['Concepto Notarial', 'Estimado']],
         body: notaryData,
         theme: 'grid',
         headStyles: { fillColor: [20, 36, 69] }
       });
    }

    // SECOND PAGE: Internal Distribution with Signatures
    doc.addPage();
    addHeader(doc);

    const finalYDist = 55;
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('INGENIERÍA DE LA LIQUIDACIÓN (Dist. Interna)', 15, finalYDist);

    let distributionData: any[] = [];
    if (context.results.isOfficeOnly) {
       distributionData = [
        ['Socio (25%)', pdfFormat(context.results.socio), '......................'],
        ['Gerente (25%)', pdfFormat(context.results.gerente), '......................'],
        ['Oficina/Caja (50%)', pdfFormat(context.results.cajaOficina), '......................'],
      ];
    } else {
      distributionData = [
        [`Agente 1: ${context.agentName}`, pdfFormat(context.results.agent), '......................'],
        ...(context.coAgencyName === 'AGENTE OFICINA' ? [[`Agente 2: ${context.coAgentName || '---'}`, pdfFormat(context.results.agent2 || 0), '......................']] : []),
        ...(context.results.type === 'VENTA' && context.results.externalShareAmount! > 0 ? [[`Colega: ${context.coAgencyName}`, pdfFormat(context.results.externalShareAmount), '......................']] : []),
        ['OFICINA NETO', pdfFormat(context.results.officeNet), 'N/A'],
        ['Socio (25% s/Neto)', pdfFormat(context.results.socio), '......................'],
        ['Gerente (25% s/Neto)', pdfFormat(context.results.gerente), '......................'],
        ['Caja Oficina (50% s/Neto)', pdfFormat(context.results.cajaOficina), '......................'],
      ];
    }

    autoTable(doc, {
      startY: finalYDist + 10,
      head: [['Actor / Fondo', 'Distribución', 'Firma de Recibido']],
      body: distributionData,
      theme: 'grid',
      headStyles: { fillColor: [10, 31, 68] },
      styles: { cellPadding: 5 }
    });

    if (context.activeTab === 'VENTA' && context.reservaMonto > 0) {
      const finalYSummaryComm = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const restaAbonar = context.results.totalAgency - context.reservaMonto;
      if (restaAbonar > 0) {
        doc.setTextColor(255, 9, 62); // Primary Red
        doc.text(`TOTAL COMISIÓN: ${pdfFormat(context.results.totalAgency)} | SEÑA: ${pdfFormat(context.reservaMonto)}`, 15, finalYSummaryComm);
        doc.text(`RESTA ABONAR COMISIÓN INMOBILIARIA: ${pdfFormat(restaAbonar)}`, 15, finalYSummaryComm + 6);
      } else {
        doc.setTextColor(0, 128, 0); // Green
        doc.text(`COMISIÓN TOTALMENTE CUBIERTA POR LA SEÑA (Excedente: ${pdfFormat(Math.abs(restaAbonar))})`, 15, finalYSummaryComm);
      }
    }

    const finalYSign = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.text('Certifico que la presente liquidación responde a los protocolos internos de TIRANTE® Bienes Raices.', 15, finalYSign);
    
    doc.save(`Liquidacion_${context.opNumber}_${context.activeTab.toLowerCase()}.pdf`);
  };

  const generateVisualPDF = async () => {
    if (isGeneratingPDF) return;
    setIsGeneratingPDF(true);
    
    const originalExplanation = showExplanation;
    const originalScrollY = window.scrollY;
    
    try {
      // 1. Scroll to top to avoid capture issues
      window.scrollTo(0, 0);
      
      // 2. Expand all hidden sections
      setShowExplanation(true);
      
      // 3. Wait for layout recalculation and images
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const element = document.getElementById('liquidation-container');
      if (!element) throw new Error("Container not found");
      
      // 4. Capture with high quality
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#F8FAFC',
        logging: false,
        width: element.offsetWidth,
        height: element.offsetHeight,
        onclone: (clonedDoc) => {
          const el = clonedDoc.getElementById('liquidation-container');
          if (el) {
             el.style.transform = 'none';
             el.style.margin = '0';
             el.style.padding = '40px';
          }
        }
      });
      
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 210; 
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      // First page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;

      // Additional pages if needed
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pageHeight;
      }

      pdf.save(`Liquidacion_Visual_${opNumber}_${activeTab}.pdf`);
    } catch (error) {
      console.error("Error generating visual PDF:", error);
      alert("Hubo un error al generar el PDF visual. Intente nuevamente.");
    } finally {
      // 5. Restore state
      setShowExplanation(originalExplanation);
      window.scrollTo(0, originalScrollY);
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div id="liquidation-container" className="flex flex-col gap-8">
      <div className="modern-card p-8 md:p-12 mb-8 bg-white border border-border-light">
      {/* Header with Title */}
      <div className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-8">
         <div className="flex flex-col gap-2">
              <div className="bg-brand-blue/10 p-3 rounded-2xl w-max">
                <Calculator className="text-brand-blue w-7 h-7" />
              </div>
              <h1 className="text-3xl font-bold text-text-title tracking-tight mt-4">Liquidación de Operación</h1>
            <p className="text-sm text-text-body font-medium">Protocolo Interno de Gestión de Honorarios</p>
         </div>

         <div className="flex gap-2 bg-[#EFF4FF] p-1.5 rounded-full self-start md:self-center border border-brand-blue/10">
            <button 
              onClick={() => setActiveTab('ALQUILER')}
              className={`modern-pill-tab ${activeTab === 'ALQUILER' ? 'bg-brand-blue text-white shadow-lg' : 'text-brand-blue hover:bg-brand-blue/5'}`}
            >
              Alquileres
            </button>
            <button 
              onClick={() => setActiveTab('VENTA')}
              className={`modern-pill-tab ${activeTab === 'VENTA' ? 'bg-brand-blue text-white shadow-lg' : 'text-brand-blue hover:bg-brand-blue/5'}`}
            >
              Ventas
            </button>
         </div>
      </div>

      {/* Sub Header / Filters */}
      <div className="flex items-center justify-between mb-10 flex-wrap gap-6 pt-8 border-t border-border-light">
        <div className="flex-1 min-w-[280px]">
           <label className="micro-label">Código Propiedad</label>
           <div className="relative group">
             <MapPin className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-blue/60 group-focus-within:text-brand-blue transition-colors" />
             <input 
              type="text" 
              className="modern-input pl-14 font-medium" 
              value={propertyCode} 
              onChange={(e) => setPropertyCode(e.target.value)} 
             />
           </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex flex-col">
            <label className="micro-label">Gestión Administrativa</label>
            <button 
              onClick={() => setIsOfficeOnly(!isOfficeOnly)}
              className={`px-6 py-3 rounded-2xl text-[11px] font-bold uppercase tracking-wider border transition-all ${isOfficeOnly ? 'bg-brand-blue border-brand-blue text-white shadow-lg shadow-brand-blue/20' : 'border-border-light text-text-body bg-bg-input hover:bg-white hover:border-brand-blue/30'}`}
            >
              {isOfficeOnly ? 'Modo Oficina' : 'Modo Agente'}
            </button>
          </div>
          
          <div className="flex flex-col">
            <label className="micro-label">Moneda</label>
            <div className="flex bg-bg-input p-1.5 rounded-2xl border border-border-light">
              <button 
                onClick={() => setIsPesos(false)}
                className={`px-5 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${!isPesos ? 'bg-white text-text-title shadow-sm border border-border-light' : 'text-text-label'}`}
              >
                USD
              </button>
              <button 
                onClick={() => setIsPesos(true)}
                className={`px-5 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${isPesos ? 'bg-white text-text-title shadow-sm border border-border-light' : 'text-text-label'}`}
              >
                ARS
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Inputs */}
      {activeTab === 'VENTA' ? (
        <div className="space-y-8 mb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col">
              <label className="micro-label">Monto de Venta ({isPesos ? 'ARS' : 'USD'})</label>
              <div className="relative group">
                <Wallet className="absolute left-6 top-1/2 -translate-y-1/2 w-8 h-8 text-brand-blue/40 group-focus-within:text-brand-blue transition-colors" />
                <input 
                  type="number"
                  className="modern-input pl-20 py-8 text-3xl font-black bg-bg-input/30 border-2 border-brand-blue/10 focus:border-brand-blue/30"
                  value={opAmount}
                  onChange={(e) => setOpAmount(Number(e.target.value))}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="flex flex-col">
              <label className="micro-label">Valor de Escritura</label>
              <div className="relative group">
                <Building2 className="absolute left-6 top-1/2 -translate-y-1/2 w-8 h-8 text-brand-blue/40 group-focus-within:text-brand-blue transition-colors" />
                <input 
                  type="number"
                  className="modern-input pl-20 py-8 text-3xl font-black bg-bg-input/30 border-2 border-brand-blue/10 focus:border-brand-blue/30"
                  value={valorDeclarar}
                  onChange={(e) => setValorDeclarar(Number(e.target.value))}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex flex-col">
              <label className="micro-label">Tipo de Cambio</label>
              <div className="relative group">
                <TrendingUp className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-blue/30 group-focus-within:text-brand-blue transition-colors" />
                <input 
                  type="number"
                  className={`modern-input pl-12 py-4 font-bold ${!isPesos && 'opacity-40 cursor-not-allowed grayscale bg-bg-input'}`}
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(Number(e.target.value))}
                  disabled={!isPesos}
                />
              </div>
            </div>
            {!isOfficeOnly && (
               <div className="flex flex-col">
                 <label className="micro-label">Agente Resp.</label>
                 <div className="relative group">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-blue/30 group-focus-within:text-brand-blue transition-colors" />
                    <input type="text" className="modern-input pl-12 py-4" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
                 </div>
               </div>
            )}
            <div className="flex flex-col">
              <label className="micro-label">N° Folio / OP</label>
              <div className="relative group">
                <ClipboardList className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-blue/30 group-focus-within:text-brand-blue transition-colors" />
                <input type="text" className="modern-input pl-12 py-4 font-bold" value={opNumber} onChange={(e) => setOpNumber(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col">
               <label className="micro-label">Esquema Administrativo</label>
               <div className="relative group">
                  <LayoutDashboard className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-blue/30 group-focus-within:text-brand-blue transition-colors" />
                  <select className="modern-input pl-12 py-4 appearance-none cursor-pointer" value={saleMode} onChange={(e) => setSaleMode(e.target.value as any)}>
                    <option value="COMPARTIDO">Compartidos</option>
                    <option value="LIBRE">Libre de Gastos</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
               </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          <div className="flex flex-col">
            <label className="micro-label">Precio Liquidación ({isPesos ? 'ARS' : 'USD'})</label>
            <div className="relative group">
              <Wallet className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-brand-blue/40 group-focus-within:text-brand-blue transition-colors" />
              <input 
                type="number"
                className="modern-input pl-16 py-5 text-xl font-bold bg-bg-input/30"
                value={opAmount}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setOpAmount(val);
                  setCleaningGastos(Number((val * 0.022).toFixed(2)));
                }}
                placeholder="0.00"
              />
            </div>
            <p className="text-[11px] text-brand-blue font-bold mt-3 ml-1 flex items-center gap-1.5 opacity-90 uppercase tracking-tighter">
              <CheckSquare className="w-4 h-4" /> Base + 10% + Limpieza
            </p>
          </div>

          <div className="flex flex-col">
            <label className="micro-label">Tipo de Cambio</label>
            <input 
              type="number"
              className={`modern-input ${!isPesos && 'opacity-40 cursor-not-allowed grayscale bg-bg-input'}`}
              value={exchangeRate}
              onChange={(e) => setExchangeRate(Number(e.target.value))}
              disabled={!isPesos}
            />
          </div>
          
          {!isOfficeOnly && (
            <div className="flex flex-col">
              <label className="micro-label">Agente Resp.</label>
              <input type="text" className="modern-input" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
            </div>
          )}

          <div className="flex flex-col">
            <label className="micro-label">N° Folio / OP</label>
            <input type="text" className="modern-input font-bold" value={opNumber} onChange={(e) => setOpNumber(e.target.value)} />
          </div>

          <div className="flex flex-col">
            <label className="micro-label">Gastos Limpieza</label>
            <input type="number" className="modern-input" value={cleaningGastos} onChange={(e) => setCleaningGastos(Number(e.target.value))} />
          </div>
          
          {!isOfficeOnly && (
            <div className="flex flex-col">
              <label className="micro-label">Origen de Captación</label>
              <div className="relative group">
                <Target className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-blue/30 group-focus-within:text-brand-blue transition-colors" />
                <select 
                  className="modern-input pl-12 py-4 appearance-none cursor-pointer"
                  value={source}
                  onChange={(e) => setSource(e.target.value as CaptationSource)}
                >
                  <option value="PROPIA">Propia (30%)</option>
                  <option value="OFICINA">Oficina (25%)</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'VENTA' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12 animate-in fade-in duration-500">
           <div className="flex flex-col">
              <label className="micro-label">% Comisión Comprador</label>
              <div className="relative group">
                 <TrendingUp className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-blue/30 group-focus-within:text-brand-blue" />
                 <input type="number" className="modern-input pl-16 py-4 font-bold bg-bg-input/20" value={commCompradorPct} onChange={(e) => setCommCompradorPct(Number(e.target.value))} />
              </div>
           </div>
           <div className="flex flex-col">
              <label className="micro-label">% Comisión Vendedor</label>
              <div className="relative group">
                 <TrendingDown className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-blue/30 group-focus-within:text-brand-blue" />
                 <input type="number" className="modern-input pl-16 py-4 font-bold bg-bg-input/20" value={commVendedorPct} onChange={(e) => setCommVendedorPct(Number(e.target.value))} />
              </div>
           </div>
        </div>
      )}
      
      <div className="mb-8 p-6 bg-brand-gray/50 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-blue/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-brand-blue" />
            </div>
            <span className="text-xs font-display font-bold text-navy-blue uppercase tracking-widest">Colaboración Inmobiliaria</span>
          </div>
          <button 
            onClick={() => setIsCompartida(!isCompartida)}
            className={`px-5 py-2 rounded-lg text-[10px] font-display font-bold uppercase transition-all shadow-sm border ${isCompartida ? 'bg-primary-red border-primary-red text-white' : 'bg-white text-slate-400 border-slate-200'}`}
          >
            {isCompartida ? 'OPERACIÓN COMPARTIDA' : 'OPERACIÓN PROPIA'}
          </button>
        </div>

        {isCompartida && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-end animate-in fade-in slide-in-from-top-1 duration-300">
             <div className="flex flex-col">
                <label className="micro-label">Esquema Colaborador</label>
                <div className="relative">
                  <select 
                    className="modern-input appearance-none"
                    value={coAgencyName === 'AGENTE OFICINA' ? 'AGENTE OFICINA' : 'EXTERNO'}
                    onChange={(e) => setCoAgencyName(e.target.value === 'AGENTE OFICINA' ? 'AGENTE OFICINA' : '')}
                  >
                     <option value="EXTERNO">Agencia Externa (Cede 100%)</option>
                     <option value="AGENTE OFICINA">Agente Interno (Split 50/50)</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                </div>
             </div>

             {coAgencyName === 'AGENTE OFICINA' ? (
            <div className="flex flex-col">
               <label className="micro-label">Segundo Agente</label>
               <input type="text" className="modern-input" value={coAgentName} onChange={(e) => setCoAgentName(e.target.value)} placeholder="Nombre del agente" />
            </div>
             ) : (
            <div className="flex flex-col">
               <label className="micro-label">Inmobiliaria Colega</label>
               <input type="text" className="modern-input" value={coAgencyName} onChange={(e) => setCoAgencyName(e.target.value)} placeholder="Ej: Keller Williams" />
            </div>
             )}

             <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${shareBuyer ? 'bg-navy-blue border-navy-blue text-white' : 'border-slate-200 bg-white'}`}>
                    {shareBuyer && <CheckSquare className="w-4 h-4" />}
                  </div>
                  <input type="checkbox" checked={shareBuyer} onChange={(e) => setShareBuyer(e.target.checked)} className="hidden" />
                  <span className="text-[11px] font-display font-semibold text-slate-gray uppercase tracking-tight group-hover:text-brand-blue transition-colors">Cede Punta Compradora</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${shareSeller ? 'bg-navy-blue border-navy-blue text-white' : 'border-slate-200 bg-white'}`}>
                    {shareSeller && <CheckSquare className="w-4 h-4" />}
                  </div>
                  <input type="checkbox" checked={shareSeller} onChange={(e) => setShareSeller(e.target.checked)} className="hidden" />
                  <span className="text-[11px] font-display font-semibold text-slate-gray uppercase tracking-tight group-hover:text-brand-blue transition-colors">Cede Punta Vendedora</span>
                </label>
             </div>
          </div>
        )}
      </div>

      {activeTab === 'VENTA' && (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10 pt-8 border-t border-slate-100">
            <div className="col-span-1 md:col-span-2 lg:col-span-4 flex items-center justify-between mb-4">
               <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-lg bg-brand-blue/10 flex items-center justify-center">
                   <FileText className="w-5 h-5 text-brand-blue" />
                 </div>
                 <span className="text-xs font-display font-bold text-navy-blue uppercase tracking-widest">Escritura y Gastos</span>
               </div>
               <button 
                 onClick={() => setIsTracto(!isTracto)}
                 className={`px-6 py-2 rounded-xl text-[10px] font-display font-bold uppercase transition-all shadow-sm border ${isTracto ? 'bg-primary-red border-primary-red text-white' : 'bg-white text-slate-400 border-slate-200 hover:text-navy-blue'}`}
               >
                 {isTracto ? 'Abreviado (Sucesión)' : 'Escritura Directa'}
               </button>
            </div>

            <div className="flex flex-col">
               <label className="micro-label">% Sellos (Total)</label>
               <input type="number" step="0.1" className="modern-input" value={escrituraPct} onChange={(e) => setEscrituraPct(Number(e.target.value))} />
            </div>
            <div className="flex flex-col">
               <label className="micro-label">% Escribanía (Honor.)</label>
               <input type="number" step="0.1" className="modern-input" value={notaryFeePct} onChange={(e) => setNotaryFeePct(Number(e.target.value))} />
            </div>
            <div className="flex flex-col">
               <label className="micro-label">% ITI / Ganancias</label>
               <input type="number" step="0.1" className="modern-input" value={itiPct} onChange={(e) => setItiPct(Number(e.target.value))} />
            </div>
            <div className="flex flex-col">
               <label className="micro-label">Estado Parcelario ($)</label>
               <input type="number" className="modern-input" value={parcelario} onChange={(e) => setParcelario(Number(e.target.value))} />
            </div>
            
            {isTracto && (
              <div className="col-span-1 md:col-span-2 lg:col-span-4 p-6 bg-red-50/50 rounded-[32px] border border-red-100 flex flex-col gap-4 animate-in zoom-in-95 duration-300">
                 <div className="flex items-center gap-2">
                   <Target className="w-5 h-5 text-primary-red" />
                   <label className="text-[11px] font-black uppercase text-primary-red tracking-wider">Tracto Abreviado (Sucesión)</label>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col">
                       <label className="micro-label">Tasa Tracto (%)</label>
                       <input type="number" step="0.1" className="modern-input focus:ring-red-500/10 focus:border-red-500/30" value={tasaTractoPct} onChange={(e) => setTasaTractoPct(Number(e.target.value))} />
                    </div>
                    <div className="flex flex-col">
                       <label className="micro-label">Costo Estimado Sucesión</label>
                       <div className="bg-white border border-red-100 p-4 rounded-2xl font-bold text-navy-blue shadow-sm">{formatCurrency(results.type === 'VENTA' ? results.sucesionJudicial : 0)}</div>
                    </div>
                 </div>
              </div>
            )}

            <div className="col-span-1 md:col-span-2 lg:col-span-4 flex items-center justify-between p-6 bg-slate-50/50 rounded-[32px] border border-slate-100 group">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${hasDeudas ? 'bg-primary-red border-primary-red text-white' : 'border-slate-200 bg-white'}`}>
                  {hasDeudas && <CheckSquare className="w-4 h-4" />}
                </div>
                <input type="checkbox" checked={hasDeudas} onChange={(e) => setHasDeudas(e.target.checked)} className="hidden" />
                <span className="text-[11px] font-bold text-slate-gray uppercase tracking-widest leading-none">Descuento de Deudas Pendientes</span>
              </label>
              {hasDeudas && (
                <div className="w-48 animate-in slide-in-from-right-4 duration-300">
                  <input type="number" className="modern-input py-3 text-center" value={deudasMonto} onChange={(e) => setDeudasMonto(Number(e.target.value))} placeholder="Monto" />
                </div>
              )}
            </div>

            <div className="col-span-1 md:col-span-2 lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-navy-blue/5 rounded-[32px] border border-navy-blue/10">
               <div className="flex flex-col">
                  <label className="micro-label">Seña de Reserva</label>
                  <input type="number" className="modern-input" value={reservaMonto} onChange={(e) => setReservaMonto(Number(e.target.value))} placeholder="Monto seña" />
               </div>
               <div className="flex flex-col">
                  <label className="micro-label">Fecha de Recepción</label>
                  <input type="date" className="modern-input" value={reservaFecha} onChange={(e) => setReservaFecha(e.target.value)} />
               </div>
            </div>
         </div>
      )}
      </div>

      {/* Visual Explanation Trigger */}
      <div className="flex items-center gap-4 mb-10 relative group">
        <div className="h-[1px] flex-1 bg-border-light"></div>
        <button 
          onClick={() => setShowExplanation(!showExplanation)}
          className={`group flex items-center justify-center gap-3 px-8 py-4 rounded-full border-2 transition-all duration-300 relative font-black text-xs uppercase tracking-widest ${showExplanation ? 'bg-primary-red text-white border-primary-red shadow-xl shadow-primary-red/20' : 'bg-white text-navy-blue border-navy-blue border-opacity-10 hover:border-opacity-30 shadow-lg shadow-navy-blue/5'}`}
        >
          <Calculator className={`w-5 h-5 transition-transform duration-500 ${showExplanation ? 'rotate-12 scale-110' : ''}`} />
          {showExplanation ? 'Ocultar Desglose Técnico' : 'Ver Desglose de Ingeniería'}
          <ChevronDown className={`w-4 h-4 transition-transform duration-500 ${showExplanation ? 'rotate-180' : ''}`} />
        </button>
        <div className="h-[1px] flex-1 bg-border-light"></div>
      </div>

      {/* Explanation Card */}
      <AnimatePresence>
        {showExplanation && (
          <motion.div 
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 40 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="overflow-hidden"
          >
            <div className="p-10 bg-white rounded-[40px] shadow-2xl space-y-10 border-4 border-slate-50 relative">
              <div className="flex items-center gap-4 border-b border-bg-input pb-6">
                 <div className="w-2 h-8 bg-brand-blue rounded-full"></div>
                 <h2 className="text-xl font-bold text-navy-blue uppercase tracking-tight">Análisis Técnico de la Operación</h2>
              </div>
              
              <div className="space-y-10">
                {activeTab === 'ALQUILER' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                    <div className="space-y-5">
                      <h3 className="micro-label text-center md:text-left">Liquidación Inquilino</h3>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center bg-navy-blue p-5 rounded-2xl shadow-lg">
                          <span className="text-white text-[11px] font-bold uppercase tracking-widest opacity-60">Precio Final p/Inq:</span>
                          <span className="font-bold text-white text-xl">{formatCurrency(opAmount)}</span>
                        </div>
                        <div className="p-6 bg-bg-input rounded-3xl space-y-4 border border-border-light shadow-sm">
                          <div className="flex justify-between text-sm border-b border-border-light pb-3">
                            <span className="text-text-label font-medium">Concepto Alquiler:</span>
                            <span className="font-bold text-text-title">{formatCurrency(results.type === 'ALQUILER' ? results.subTotalLiquidacion : 0)}</span>
                          </div>
                          <div className="flex justify-between text-sm border-b border-border-light pb-3">
                            <span className="text-text-label font-medium">Honorarios (10%):</span>
                            <span className="font-bold text-brand-blue">+{formatCurrency(results.type === 'ALQUILER' ? results.commInquilino : 0)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-text-label font-medium">Fondo de Limpieza:</span>
                            <span className="font-bold text-text-title">+{formatCurrency(cleaningGastos)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-5">
                      <h3 className="micro-label text-center md:text-left">Liquidación Propietario</h3>
                      <div className="p-6 bg-white rounded-3xl space-y-4 border border-border-light shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-[#15803D]"></div>
                        <div className="flex justify-between text-xs">
                           <span className="text-text-label font-bold">Total Abonado:</span>
                           <span className="font-bold text-text-title">{formatCurrency(opAmount)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                           <span className="text-text-label/60">(-) Limpieza:</span>
                           <span className="font-medium text-text-label">-{formatCurrency(cleaningGastos)}</span>
                        </div>
                        <div className="flex justify-between text-xs border-b border-border-light pb-4">
                           <span className="text-text-label/60">(-) Comisión Inq.:</span>
                           <span className="font-medium text-text-label">-{formatCurrency(results.type === 'ALQUILER' ? results.commInquilino : 0)}</span>
                        </div>
                        
                        <div className="flex justify-between py-1 items-center">
                           <span className="text-xs font-black text-text-title uppercase tracking-tighter">Base Imponible:</span>
                           <span className="text-base font-black text-text-title">{formatCurrency(results.type === 'ALQUILER' ? results.subTotalLiquidacion : 0)}</span>
                        </div>

                        <div className="flex justify-between text-xs border-t border-border-light pt-4">
                           <span className="text-primary-red/80 font-medium">(-) Comisión Prop. (10%):</span>
                           <span className="font-bold text-primary-red">-{formatCurrency(results.type === 'ALQUILER' ? results.commPropietario : 0)}</span>
                        </div>
                        
                        <div className="pt-4 flex justify-between items-center">
                          <span className="px-4 py-1.5 bg-green-100 text-[#15803D] rounded-full text-[10px] font-black uppercase">Neto a Recibir</span>
                          <span className="text-2xl font-black text-[#15803D] tracking-tight">{formatCurrency(results.type === 'ALQUILER' ? results.propietarioRecibe : 0)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-5">
                      <h3 className="micro-label text-center md:text-left">Agencia TIRANTE®</h3>
                      <div className="space-y-4 text-sm">
                        <div className="flex justify-between items-center bg-brand-blue/5 p-5 rounded-2xl border border-brand-blue/10">
                          <span className="text-text-body font-bold">Masa de Comisión:</span>
                          <span className="font-black text-brand-blue text-lg">{formatCurrency(results.totalAgency)}</span>
                        </div>
                        <div className="bg-bg-input p-5 rounded-2xl space-y-3">
                           <div className="flex items-center gap-3 text-[11px] text-text-body">
                             <div className="w-1.5 h-1.5 bg-brand-blue rounded-full"></div>
                             <span>10% Aportado por Inquilino</span>
                           </div>
                           <div className="flex items-center gap-3 text-[11px] text-text-body">
                             <div className="w-1.5 h-1.5 bg-brand-blue rounded-full"></div>
                             <span>10% Aportado por Propietario</span>
                           </div>
                           <div className="pt-3 border-t border-border-light mt-2">
                             <div className="flex items-center gap-3 text-[10px] text-brand-blue font-bold uppercase italic">
                               <RotateCcw className="w-3.5 h-3.5" />
                               <span>Fondo de Limpieza (No comisionable)</span>
                             </div>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                    <div className="space-y-4">
                      <h3 className="text-[11px] font-bold text-slate-gray uppercase">Participación Comprador</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-500">Valor del Inmueble:</span>
                          <span className="font-bold text-dark-blue">{formatCurrency(opAmount)}</span>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-xl space-y-2 border border-gray-100 shadow-inner">
                          <div className="flex justify-between text-xs font-medium">
                            <span>Valor Base:</span>
                            <span>{formatCurrency(opAmount)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span>Honorarios Agencia:</span>
                            <span className="font-bold text-primary-red">+{formatCurrency(results.type === 'VENTA' ? results.commComprador : 0)}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-400 italic">
                            <span>(Sobre Monto Real: {commCompradorPct}%)</span>
                          </div>
                        </div>

                        <div className="p-3 bg-blue-50 rounded-xl space-y-2 border border-blue-100 shadow-inner">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-tighter font-sans">Escribanía (Comprador)</span>
                            <span className="text-[8px] text-blue-300 font-bold uppercase">Base: {formatCurrency(valorDeclarar)}</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                             <span>Sellos ({(saleMode === 'COMPARTIDO' ? escrituraPct / 2 : escrituraPct).toFixed(1)}%):</span>
                             <span className="font-medium">+{formatCurrency(results.type === 'VENTA' ? results.sellosComprador : 0)}</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                             <span>Honorarios Escribano ({notaryFeePct}%):</span>
                             <span className="font-medium">+{formatCurrency(results.type === 'VENTA' ? results.honorariosEscribano : 0)}</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                             <span>Tasas e Inscripción:</span>
                             <span className="font-medium">+{formatCurrency(results.type === 'VENTA' ? results.inscripcionMonto : 0)}</span>
                          </div>
                          {reservaMonto > 0 && (
                            <div className="flex justify-between text-[11px] text-green-600 font-bold bg-green-50 p-1 rounded mt-1 border border-green-100">
                               <span>(-) SEÑA DE RESERVA:</span>
                               <span>-{formatCurrency(reservaMonto)}</span>
                            </div>
                          )}
                          {saleMode === 'LIBRE' && (
                            <div className="pt-2 border-t border-blue-200 mt-1 space-y-1">
                              <span className="text-[10px] text-blue-600 font-bold uppercase block">Gastos Vendedor (Asumidos):</span>
                              <div className="flex justify-between text-[10px]">
                                <span>ITI / Certif. / Otros:</span>
                                <span>+{formatCurrency((results.type === 'VENTA' ? (results.iti + results.certificadosMonto + results.parcelario + results.sucesionJudicial + results.tasaTracto + (hasDeudas ? deudasMonto : 0)) : 0))}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between text-xs font-bold">
                          <span className="text-dark-blue uppercase tracking-tighter">Total Costo Cliente:</span>
                          <span className="text-blue-600">{formatCurrency(results.type === 'VENTA' ? results.totalOperacion : 0)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-[11px] font-bold text-slate-gray uppercase">Participación Vendedor</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-500">Valor del Inmueble:</span>
                          <span className="font-bold text-dark-blue">{formatCurrency(opAmount)}</span>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-xl space-y-2 border border-gray-100 shadow-inner">
                          <div className="flex justify-between text-xs font-medium">
                            <span>Valor Base:</span>
                            <span>{formatCurrency(opAmount)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span>Honorarios Agencia:</span>
                            <span className="font-bold text-primary-red">-{formatCurrency(results.type === 'VENTA' ? results.commVendedor : 0)}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-400 italic">
                            <span>(Sobre Monto Real: {commVendedorPct}%)</span>
                          </div>
                        </div>

                        <div className="p-3 bg-red-50 rounded-xl space-y-2 border border-red-100 shadow-inner">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] text-primary-red font-bold uppercase tracking-tighter font-sans">Gastos Título (Vendedor)</span>
                            <span className="text-[8px] text-red-300 font-bold uppercase">Base: {formatCurrency(valorDeclarar)}</span>
                          </div>
                          {saleMode === 'LIBRE' ? (
                            <p className="text-[10px] text-slate-gray italic py-2">Transferidos al Comprador (Libre de Gastos)</p>
                          ) : (
                            <>
                              {saleMode === 'COMPARTIDO' && (
                                <div className="flex justify-between text-[11px]">
                                  <span>Sellos ({escrituraPct / 2}%):</span>
                                  <span className="font-medium">-{formatCurrency(results.type === 'VENTA' ? results.sellosVendedor : 0)}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-[11px]">
                                 <span>Imp. Transferencia (ITI {itiPct}%):</span>
                                 <span className="font-medium">-{formatCurrency(results.type === 'VENTA' ? results.iti : 0)}</span>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                 <span>Diligenciamientos/Cert.:</span>
                                 <span className="font-medium">-{formatCurrency(results.type === 'VENTA' ? results.certificadosMonto : 0)}</span>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                 <span>Estado Parcelario:</span>
                                 <span className="font-medium">-{formatCurrency(results.type === 'VENTA' ? results.parcelario : 0)}</span>
                              </div>
                              {isTracto && (
                                <div className="bg-primary-red/10 p-2 rounded-lg text-primary-red font-bold text-[10px] border border-primary-red/10">
                                  <div className="flex justify-between font-bold">
                                    <span>Tasa Tracto ({tasaTractoPct}%):</span>
                                    <span>-{formatCurrency(results.type === 'VENTA' ? results.tasaTracto : 0)}</span>
                                  </div>
                                  <div className="flex justify-between mt-1 text-[9px] text-primary-red/70">
                                    <span>Honorarios Sucesión:</span>
                                    <span>-{formatCurrency(results.type === 'VENTA' ? results.sucesionJudicial : 0)}</span>
                                  </div>
                                </div>
                              )}
                              {hasDeudas && (
                                <div className="flex justify-between text-[11px] text-primary-red font-bold bg-white/50 p-1 rounded">
                                  <span>Retención Deudas:</span>
                                  <span>-{formatCurrency(deudasMonto)}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between text-xs font-bold">
                          <span className="text-dark-blue uppercase tracking-tighter">Neto a Recibir:</span>
                          <span className="text-green-600">{formatCurrency(results.type === 'VENTA' ? results.vendedorRecibe : 0)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                       <h3 className="text-[11px] font-bold text-slate-gray uppercase">Liquidación Inmobiliaria</h3>
                       <div className="space-y-3 text-xs">
                        <div className="flex justify-between items-center bg-dark-blue/5 p-3 rounded-xl border border-dark-blue/10">
                          <span className="text-gray-600">Comisión TIRANTE®:</span>
                          <span className="font-bold text-primary-red leading-none">{formatCurrency(results.totalAgency)}</span>
                        </div>
                        {activeTab === 'VENTA' && reservaMonto > 0 && (
                          <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                            <div className="flex justify-between text-[10px] text-red-600 font-bold">
                              <span>Seña Recibida:</span>
                              <span>-{formatCurrency(reservaMonto)}</span>
                            </div>
                            {results.totalAgency > reservaMonto ? (
                              <div className="flex justify-between text-[10px] text-red-800 font-black mt-1 uppercase tracking-tighter">
                                <span>RESTA ABONAR COMISIÓN:</span>
                                <span>{formatCurrency(results.totalAgency - reservaMonto)}</span>
                              </div>
                            ) : (
                              <div className="text-[9px] text-green-600 font-bold mt-1 text-center bg-white p-1 rounded border border-green-100 uppercase">
                                Comisión Totalmente Cubierta
                              </div>
                            )}
                          </div>
                        )}
                        {isCompartida && (
                          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-[10px]">
                            <p className="font-bold text-blue-600 mb-1">CO-CONSTRUCCIÓN: {coAgencyName || 'OTRA AGENCIA'}</p>
                            <p className="text-gray-500 leading-tight">Compartido 50/50 puntas: {[shareBuyer && 'Compradora', shareSeller && 'Vendedora'].filter(Boolean).join(' y ') || 'Ninguna'}.</p>
                          </div>
                        )}
                        <p className="text-[10px] text-slate-gray leading-relaxed p-2 bg-gray-50 rounded-lg italic">
                          Las comisiones inmobiliarias se calculan sobre el **Valor Real**, mientras que los aportes de escritura se basan en el **Valor a Declarar**.
                        </p>
                        <div className="p-3 bg-yellow-50 rounded-xl border border-yellow-200 text-[10px] text-yellow-800">
                          {activeTab === 'VENTA' && (
                              <><strong>Nota Gastos:</strong> Los valores notariales son simulados según usos y costumbres y sujetos a liquidación final del Escribano.</>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Results Display */}
      <div className="flex-1 bg-white rounded-[40px] p-1 shadow-2xl shadow-brand-blue/10 space-y-0 relative overflow-hidden border-4 border-slate-50">
        {/* Results Tabs Toggle */}
        <div className="flex bg-bg-input/50 p-2 rounded-t-[36px] gap-2">
            <button 
              onClick={() => setResultsView('OPERACION')}
              className={`flex-1 py-4 rounded-[32px] text-xs font-black uppercase tracking-widest transition-all ${resultsView === 'OPERACION' ? 'bg-white text-navy-blue shadow-lg border border-border-light' : 'text-text-label hover:bg-white/50'}`}
            >
              Vista Operación (Cliente)
            </button>
            <button 
              onClick={() => setResultsView('HONORARIOS')}
              className={`flex-1 py-4 rounded-[32px] text-xs font-black uppercase tracking-widest transition-all ${resultsView === 'HONORARIOS' ? 'bg-primary-red text-white shadow-xl shadow-primary-red/20' : 'text-text-label hover:bg-white/50'}`}
            >
              Vista Honorarios (Interna)
            </button>
        </div>

        <div className="p-8 md:p-14">
          <AnimatePresence mode="wait">
            {resultsView === 'OPERACION' ? (
              <motion.div 
                key="op"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-12"
              >
                <div className="text-center">
                   <span className="micro-label mb-4 opacity-100 text-brand-blue font-bold tracking-[0.2em]">{results.type === 'ALQUILER' ? 'Beneficio Propietario' : 'Neto p/Vendedor'}</span>
                   <h2 className="text-6xl md:text-8xl font-black text-text-title tracking-tighter leading-none mb-6">
                     {formatCurrency(results.type === 'ALQUILER' ? results.propietarioRecibe : results.vendedorRecibe)}
                   </h2>
                   <div className="flex justify-center">
                      <div className="px-6 py-2 bg-green-100 text-[#15803D] rounded-full text-[10px] font-black uppercase tracking-widest">Saldo Final Liquidado</div>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-10 bg-bg-input rounded-[32px] border border-border-light shadow-sm">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-full bg-brand-blue/10 flex items-center justify-center">
                           <TrendingUp className="w-6 h-6 text-brand-blue" />
                        </div>
                        <span className="text-[11px] uppercase text-navy-blue font-bold tracking-widest">
                          {results.type === 'ALQUILER' ? 'Precio de Lista' : 'Inversión Comprador'}
                        </span>
                      </div>
                      <span className="text-4xl md:text-5xl font-bold text-text-title tracking-tight">{formatCurrency(results.type === 'ALQUILER' ? opAmount : results.totalOperacion)}</span>
                    </div>
                    
                    <div className="p-10 bg-white rounded-[32px] border-2 border-brand-blue/10 shadow-sm">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-full bg-primary-red/10 flex items-center justify-center">
                           <Target className="w-6 h-6 text-primary-red" />
                        </div>
                        <span className="text-[11px] uppercase text-primary-red font-bold tracking-widest">Comisión Agencia</span>
                      </div>
                      <span className="text-4xl md:text-5xl font-bold text-primary-red tracking-tight">{formatCurrency(results.totalAgency)}</span>
                    </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="hon"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-12"
              >
                  <div className="text-center">
                     <span className="micro-label mb-4 opacity-100 text-primary-red font-bold tracking-[0.2em]">Total Honorable Comisión</span>
                     <h2 className="text-6xl md:text-8xl font-black text-text-title tracking-tighter leading-none mb-6">
                       {formatCurrency(results.totalAgency)}
                     </h2>
                     <div className="flex justify-center gap-4">
                        <span className="bg-navy-blue text-white text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-md">Protocolo TIRANTE®</span>
                        <span className="bg-brand-blue/10 text-brand-blue text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">100% Gestión Inmobiliaria</span>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     <div className="modern-card p-8 bg-white border border-border-light text-center">
                        <span className="text-[10px] font-bold text-text-label uppercase tracking-widest block mb-1">Agente</span>
                        <div className="text-2xl font-black text-brand-blue">{formatCurrency(results.agent)}</div>
                     </div>
                     <div className="modern-card p-8 bg-navy-blue border border-navy-blue text-center text-white scale-110 shadow-xl">
                        <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest block mb-1">Neto Oficina</span>
                        <div className="text-3xl font-black">{formatCurrency(results.officeNet)}</div>
                     </div>
                     <div className="modern-card p-8 bg-white border border-border-light text-center">
                        <span className="text-[10px] font-bold text-text-label uppercase tracking-widest block mb-1">Co-Agente / Colega</span>
                        <div className="text-2xl font-black text-primary-red">{formatCurrency(coAgencyName === 'AGENTE OFICINA' ? (results.agent2 || 0) : (results.externalShareAmount || 0))}</div>
                     </div>
                  </div>

                  <div className="pt-10 border-t border-bg-input">
                    <div className="flex items-center gap-4 mb-8">
                      <Users className="w-5 h-5 text-text-label" />
                      <span className="text-[11px] uppercase text-text-label font-bold tracking-[0.3em]">Distribución del Neto (50/50)</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       <div className="bg-bg-input p-6 rounded-3xl text-center border border-border-light">
                          <span className="text-[9px] uppercase font-bold text-text-label block mb-1">Socio (25%)</span>
                          <div className="text-xl font-bold text-navy-blue">{formatCurrency(results.socio)}</div>
                       </div>
                       <div className="bg-bg-input p-6 rounded-3xl text-center border border-border-light">
                          <span className="text-[9px] uppercase font-bold text-text-label block mb-1">Gerente (25%)</span>
                          <div className="text-xl font-bold text-navy-blue">{formatCurrency(results.gerente)}</div>
                       </div>
                       <div className="bg-primary-red/5 p-6 rounded-3xl text-center border border-primary-red/10">
                          <span className="text-[9px] uppercase font-bold text-primary-red block mb-1">Caja Ofi (50%)</span>
                          <div className="text-xl font-bold text-primary-red">{formatCurrency(results.cajaOficina)}</div>
                       </div>
                    </div>
                  </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col gap-4 mt-8">
        <label 
          data-html2canvas-ignore
          className="flex items-center justify-between p-6 bg-slate-50/50 rounded-[32px] border border-slate-100 cursor-pointer group hover:bg-slate-50 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isFacturado ? 'bg-primary-red border-primary-red text-white' : 'border-slate-200 bg-white'}`}>
              {isFacturado && <CheckSquare className="w-4 h-4" />}
            </div>
            <span className="text-[11px] font-bold text-slate-gray uppercase tracking-widest leading-none">Generar con Factura / I.V.A</span>
          </div>
          <input 
            type="checkbox" 
            checked={isFacturado} 
            onChange={(e) => setIsFacturado(e.target.checked)}
            className="hidden"
          />
          <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full ${isFacturado ? 'bg-red-100 text-primary-red' : 'bg-slate-100 text-slate-400'}`}>
            {isFacturado ? 'ACTIVO' : 'NO'}
          </span>
        </label>

        <div className="flex justify-center w-full">
           <button 
             onClick={handleSaveLiquidation}
             data-html2canvas-ignore
             className="group relative px-12 py-5 bg-[#D42023] hover:bg-[#B71C1E] text-white rounded-[32px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-primary-red/40 transition-all active:scale-95 flex items-center justify-center gap-4 overflow-hidden border-2 border-white/10"
           >
              <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
              <Database className="w-5 h-5 relative z-10" />
              <span className="relative z-10">Guardar en Historial</span>
           </button>
        </div>

        <button 
          onClick={() => generatePDF()}
          data-html2canvas-ignore
          className="w-full flex items-center justify-center gap-3 py-5 text-[11px] font-bold uppercase tracking-widest text-brand-blue border-2 border-brand-blue/10 rounded-[32px] hover:bg-brand-blue/5 transition-all"
        >
          <Download className="w-5 h-5" />
          Descargar Informe PDF Técnico
        </button>

        <button 
          onClick={generateVisualPDF}
          disabled={isGeneratingPDF}
          data-html2canvas-ignore
          className={`w-full flex items-center justify-center gap-3 py-5 text-[11px] font-bold uppercase tracking-widest rounded-[32px] transition-all active:scale-95 border-2 ${
            isGeneratingPDF 
            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-wait' 
            : 'text-brand-blue border-brand-blue/10 hover:bg-brand-blue/5 shadow-lg shadow-brand-blue/5'
          }`}
        >
          {isGeneratingPDF ? (
            <>
              <RotateCcw className="w-5 h-5 animate-spin" />
              Generando PDF...
            </>
          ) : (
            <>
              <FileText className="w-5 h-5" />
              Descargar PDF (Vista Web Completa)
            </>
          )}
        </button>
      </div>

      <div className="mt-8 flex flex-col items-center">
        <span className="text-[10px] text-slate-gray font-bold uppercase tracking-[0.2em] opacity-40">Liquidación de Uso Interno - TIRANTE®</span>
      </div>

      {/* DASHBOARD TRANSITION ARROW */}
    <div className="mt-12 flex items-center gap-4 w-full">
        <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-brand-gray to-primary-red opacity-30"></div>
        <button 
          onClick={() => setShowDashboard(!showDashboard)}
          className="bg-brand-gray p-3 rounded-full border border-gray-200 shadow-2xl hover:scale-110 transition-transform active:scale-95 flex items-center justify-center text-dark-text"
        >
          {showDashboard ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        <div className="h-[2px] flex-1 bg-gradient-to-l from-transparent via-brand-gray to-primary-red opacity-30"></div>
      </div>

      <AnimatePresence>
        {showDashboard && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="mt-8 space-y-8 pb-12"
          >
            <div className="bg-white rounded-xl p-8 md:p-10 shadow-sm border border-slate-200">
               <div className="flex items-center justify-between mb-10 pb-6 border-b border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="bg-brand-blue/10 p-4 rounded-xl">
                      <History className="text-brand-blue w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-display font-bold text-navy-blue tracking-tight">Dashboard Histórico</h2>
                      <p className="text-sm text-slate-gray font-medium tracking-tight">Gestión consolidada de operaciones</p>
                    </div>
                  </div>
                  <button 
                    onClick={resetSystem}
                    className="flex items-center gap-2 bg-white text-slate-400 px-6 py-3 rounded-xl text-[11px] font-display font-bold uppercase tracking-widest hover:bg-red-50 hover:text-primary-red transition-all border border-slate-200"
                  >
                    <RotateCcw size={14} />
                    Reiniciar
                  </button>
               </div>

               <div className="grid lg:grid-cols-2 gap-12">
                  {/* ALQUILERES */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 px-2">
                      <TrendingUp className="w-5 h-5 text-lime-accent" />
                      <h3 className="text-[13px] font-display font-bold text-navy-blue uppercase tracking-[0.1em]">Alquileres</h3>
                      <span className="ml-auto bg-slate-100 text-slate-500 text-[10px] font-display font-bold px-3 py-1 rounded-full">{savedLiquidations.filter(l => l.type === 'ALQUILER').length}</span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
                       <table className="w-full text-left">
                          <thead>
                             <tr className="bg-brand-gray/50 border-b border-slate-100">
                                <th className="px-6 py-4 text-[10px] font-display font-bold text-slate-gray uppercase tracking-widest">OP / Agente</th>
                                <th className="px-6 py-4 text-right text-[10px] font-display font-bold text-slate-gray uppercase tracking-widest">Comisión</th>
                                <th className="px-4 py-3"></th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                             {savedLiquidations.filter(l => l.type === 'ALQUILER').length === 0 ? (
                               <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-300 font-display italic">Sin registros de alquiler</td></tr>
                             ) : (
                               savedLiquidations.filter(l => l.type === 'ALQUILER').map(l => (
                                 <tr key={l.id} className="group hover:bg-bg-gray transition-colors">
                                   <td className="px-6 py-5">
                                     <div className="flex flex-col">
                                       <span className="text-sm font-display font-bold text-navy-blue group-hover:text-brand-blue transition-colors cursor-pointer flex items-center gap-2" onClick={() => generatePDF(l)}>
                                         <span className="bg-slate-100 text-slate-400 text-[10px] px-2 py-0.5 rounded-md font-mono">{l.opNumber}</span>
                                         {l.propertyCode}
                                       </span>
                                       <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tight mt-1">{l.agentName} • {new Date(l.date).toLocaleDateString()}</span>
                                     </div>
                                   </td>
                                   <td className="px-6 py-5 text-right font-mono font-bold text-navy-blue text-sm">
                                     {formatCurrency(l.totalAgencyUSD)}
                                   </td>
                                   <td className="px-6 py-5 text-right">
                                     <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                       <button 
                                         onClick={() => generatePDF(l)}
                                         className="p-2 bg-white text-slate-400 rounded-lg hover:text-brand-blue hover:shadow-md transition-all border border-slate-100"
                                       >
                                         <Download size={14} />
                                       </button>
                                       <button 
                                         onClick={() => deleteLiquidation(l.id)}
                                         className="p-2 bg-white text-slate-400 rounded-lg hover:text-primary-red hover:shadow-md transition-all border border-slate-100"
                                       >
                                         <Trash2 size={14} />
                                       </button>
                                     </div>
                                   </td>
                                 </tr>
                               ))
                             )}
                          </tbody>
                       </table>
                    </div>
                  </div>

                  {/* VENTAS */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 px-2">
                      <Building2 className="w-5 h-5 text-navy-blue" />
                      <h3 className="text-[13px] font-display font-bold text-navy-blue uppercase tracking-[0.1em]">Ventas</h3>
                      <span className="ml-auto bg-slate-100 text-slate-500 text-[10px] font-display font-bold px-3 py-1 rounded-full">{savedLiquidations.filter(l => l.type === 'VENTA').length}</span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
                       <table className="w-full text-left">
                          <thead>
                             <tr className="bg-brand-gray/50 border-b border-slate-100">
                                <th className="px-6 py-4 text-[10px] font-display font-bold text-slate-gray uppercase tracking-widest">OP / Agente</th>
                                <th className="px-6 py-4 text-right text-[10px] font-display font-bold text-slate-gray uppercase tracking-widest">Comisión</th>
                                <th className="px-4 py-3"></th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                             {savedLiquidations.filter(l => l.type === 'VENTA').length === 0 ? (
                               <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-300 font-display italic">Sin registros de venta</td></tr>
                             ) : (
                               savedLiquidations.filter(l => l.type === 'VENTA').map(l => (
                                 <tr key={l.id} className="group hover:bg-bg-gray transition-colors">
                                   <td className="px-6 py-5">
                                     <div className="flex flex-col">
                                       <span className="text-sm font-display font-bold text-navy-blue group-hover:text-brand-blue transition-colors cursor-pointer flex items-center gap-2" onClick={() => generatePDF(l)}>
                                         <span className="bg-slate-100 text-slate-400 text-[10px] px-2 py-0.5 rounded-md font-mono">{l.opNumber}</span>
                                         {l.propertyCode}
                                       </span>
                                       <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tight mt-1">{l.agentName} • {new Date(l.date).toLocaleDateString()}</span>
                                     </div>
                                   </td>
                                   <td className="px-6 py-5 text-right font-mono font-bold text-navy-blue text-sm">
                                     {formatCurrency(l.totalAgencyUSD)}
                                   </td>
                                   <td className="px-6 py-5 text-right">
                                     <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                       <button 
                                         onClick={() => generatePDF(l)}
                                         className="p-2 bg-white text-slate-400 rounded-lg hover:text-brand-blue hover:shadow-md transition-all border border-slate-100"
                                       >
                                         <Download size={14} />
                                       </button>
                                       <button 
                                         onClick={() => deleteLiquidation(l.id)}
                                         className="p-2 bg-white text-slate-400 rounded-lg hover:text-primary-red hover:shadow-md transition-all border border-slate-100"
                                       >
                                         <Trash2 size={14} />
                                       </button>
                                     </div>
                                   </td>
                                 </tr>
                               ))
                             )}
                          </tbody>
                       </table>
                    </div>
                  </div>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

            {/* FINANCIAL BOXES SECTION */}
            <div className="space-y-12 mt-20 pb-24">
              <div className="text-center">
                <span className="micro-label opacity-40 mb-3 block">Consolidación Operativa</span>
                <h2 className="text-2xl font-bold text-text-title tracking-tight">Centro de Gestión Financiera</h2>
                <div className="w-16 h-1.5 bg-brand-blue mx-auto rounded-full mt-4"></div>
              </div>
              
              {/* PRIMARY BOX: TOTAL OFICINA */}
              <div className="flex justify-center px-4">
                <button 
                  onClick={() => setActiveBox(activeBox === 'Caja Total' ? null : 'Caja Total')}
                  className={`group relative flex flex-col items-center justify-center p-12 md:p-16 bg-white rounded-[48px] shadow-2xl transition-all active:scale-95 w-full max-w-2xl border-4 ${activeBox === 'Caja Total' ? 'border-primary-red shadow-primary-red/20' : 'border-primary-red/10 hover:border-primary-red/30'}`}
                >
                  <div className="bg-primary-red text-white p-8 rounded-[32px] mb-8 group-hover:scale-110 transition-transform shadow-xl shadow-primary-red/20">
                    <LayoutDashboard size={56} />
                  </div>
                  <div className="text-center">
                    <span className="text-[12px] font-bold uppercase text-text-label tracking-[0.4em] block mb-4">Efectivo Consolidado</span>
                    <span className="text-6xl md:text-8xl font-bold text-text-title tracking-tighter">{formatCurrency(getBoxTotal('Caja Total'))}</span>
                  </div>
                  <div className="absolute bottom-6 right-8 opacity-10">
                    <Target size={120} />
                  </div>
                </button>
              </div>

              {/* OTHER BOXES: Avatar Style */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8">
                {[
                  { id: 'Agente', label: 'Agentes', bgColor: 'bg-emerald-100', iconColor: 'text-emerald-600', icon: <Users size={24} />, value: getBoxTotal('Agente') },
                  { id: 'Oficina', label: 'Oficina', bgColor: 'bg-blue-100', iconColor: 'text-blue-600', icon: <Building2 size={24} />, value: getBoxTotal('Oficina') },
                  { id: 'Socio', label: 'Socios', bgColor: 'bg-red-100', iconColor: 'text-primary-red', icon: <Wallet size={24} />, value: getBoxTotal('Socio') },
                  { id: 'Gerente', label: 'Gerentes', bgColor: 'bg-indigo-100', iconColor: 'text-indigo-600', icon: <Target size={24} />, value: getBoxTotal('Gerente') },
                  { id: 'Limpieza', label: 'Limpieza', bgColor: 'bg-teal-100', iconColor: 'text-teal-600', icon: <RotateCcw size={24} />, value: getBoxTotal('Limpieza') },
                ].map(box => (
                  <button 
                    key={box.id}
                    onClick={() => setActiveBox(activeBox === box.id ? null : box.id)}
                    className={`group flex flex-col items-center p-10 bg-white rounded-[40px] shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all active:scale-95 border border-border-light ${activeBox === box.id ? 'ring-4 ring-brand-blue ring-offset-8' : ''}`}
                  >
                    <div className={`w-20 h-20 rounded-full ${box.bgColor} ${box.iconColor} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner`}>
                      {box.icon}
                    </div>
                    <div className="text-center">
                      <span className="text-[11px] font-bold uppercase text-text-label tracking-widest block mb-1 opacity-50">{box.label}</span>
                      <span className="text-xl font-bold text-text-title">{formatCurrency(box.value)}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* BOX DRILL-DOWN */}
              <AnimatePresence>
                {activeBox && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 relative">
                       <div className="flex justify-between items-center mb-8">
                          <div className="flex flex-col">
                            <h3 className="text-navy-blue font-black uppercase tracking-widest text-sm">
                               Detalle: {activeBox === 'Agente' ? 'Comisiones a Liquidar' : activeBox}
                            </h3>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Historial de movimientos y saldos</span>
                          </div>
                          <button 
                            onClick={() => handleWithdrawal(activeBox)}
                            className="bg-primary-red text-white px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:shadow-lg hover:shadow-red-500/20 transition-all active:scale-95 flex items-center gap-2"
                          >
                            <RotateCcw size={14} className="rotate-45" />
                            Realizar Retiro
                          </button>
                       </div>

                       <div className="grid lg:grid-cols-2 gap-10">
                          {/* INCOMES */}
                          <div className="space-y-4">
                             <h4 className="text-[11px] text-lime-accent font-black uppercase tracking-widest px-2">Ingresos Consolidados</h4>
                             <div className="bg-slate-50/50 rounded-[24px] border border-slate-100 overflow-hidden">
                                <table className="w-full text-left">
                                   <thead className="bg-white text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                      <tr>
                                        <th className="px-6 py-4">{activeBox === 'Agente' ? 'Agente' : 'Tipo / Prop.'}</th>
                                        <th className="px-6 py-4">ID / Fecha</th>
                                        <th className="px-6 py-4 text-right">Monto</th>
                                      </tr>
                                   </thead>
                                   <tbody className="divide-y divide-slate-100 font-sans">
                                      {savedLiquidations.flatMap(l => {
                                        const entries: any[] = [];
                                        
                                        if (activeBox === 'Agente') {
                                          const a1 = l.agent1CommissionUSD || (l as any).agentCommissionUSD || 0;
                                          if (a1 > 0) {
                                            entries.push({
                                              id: l.id + '-a1',
                                              label: l.agentName,
                                              subLabel: l.propertyCode || 'N/A',
                                              op: l.opNumber,
                                              date: l.date,
                                              amount: a1,
                                              snapshot: l
                                            });
                                          }
                                          if (l.agent2CommissionUSD && l.agent2CommissionUSD > 0) {
                                            entries.push({
                                              id: l.id + '-a2',
                                              label: l.agent2Name,
                                              subLabel: l.propertyCode,
                                              op: l.opNumber,
                                              date: l.date,
                                              amount: l.agent2CommissionUSD,
                                              snapshot: l
                                            });
                                          }
                                        } else {
                                          let amount = 0;
                                          if (activeBox === 'Oficina') amount = l.officeNetUSD;
                                          if (activeBox === 'Socio') amount = l.socioUSD;
                                          if (activeBox === 'Gerente') amount = l.gerenteUSD;
                                          if (activeBox === 'Caja Total') amount = l.cajaOficinaUSD;
                                          if (activeBox === 'Limpieza') amount = l.cleaningUSD;

                                          if (amount > 0) {
                                            entries.push({
                                              id: l.id,
                                              label: l.type,
                                              subLabel: l.propertyCode || 'N/A',
                                              op: l.opNumber,
                                              date: l.date,
                                              amount: amount,
                                              snapshot: l
                                            });
                                          }
                                        }
                                        return entries;
                                      }).map(entry => (
                                        <tr key={entry.id} className="hover:bg-white transition-colors">
                                          <td className="px-6 py-4">
                                            <div className="text-xs font-bold text-navy-blue uppercase">{entry.label}</div>
                                            <div className="text-[9px] text-slate-400 font-medium tracking-wide">{entry.subLabel}</div>
                                          </td>
                                          <td className="px-6 py-4">
                                            <button 
                                              onClick={() => generatePDF(entry.snapshot)}
                                              className="text-[11px] font-bold text-navy-blue border-b border-dotted border-slate-300 hover:text-navy-blue transition-colors"
                                            >
                                              {entry.op}
                                            </button>
                                            <div className="text-[9px] text-slate-400 font-medium">{new Date(entry.date).toLocaleDateString()}</div>
                                          </td>
                                          <td className="px-6 py-4 text-right font-black text-lime-accent text-sm">+{formatCurrency(entry.amount)}</td>
                                        </tr>
                                       ))}
                                    </tbody>
                                 </table>
                              </div>
                           </div>
 
                           {/* WITHDRAWALS */}
                           <div className="space-y-4">
                              <h4 className="text-[11px] text-primary-red font-black uppercase tracking-widest px-2">Egresos y Retiros</h4>
                              <div className="bg-slate-50/50 rounded-[24px] border border-slate-100 overflow-hidden">
                                 <table className="w-full text-left">
                                    <thead className="bg-white text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                       <tr>
                                         <th className="px-6 py-4">ID / Fecha</th>
                                         <th className="px-6 py-4">Receptor / Resp.</th>
                                         <th className="px-6 py-4 text-right">Monto</th>
                                      </tr>
                                   </thead>
                                   <tbody className="divide-y divide-slate-100 font-sans">
                                       {withdrawals.filter(w => w.boxId === activeBox).length === 0 ? (
                                         <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-400 font-medium italic">Sin retiros</td></tr>
                                       ) : (
                                         withdrawals.filter(w => w.boxId === activeBox).map(w => (
                                           <tr key={w.id} className="hover:bg-white transition-colors">
                                             <td className="px-6 py-4">
                                                <div className="text-xs font-bold text-navy-blue">{w.id}</div>
                                                <div className="text-[9px] text-slate-400 font-medium">{new Date(w.date).toLocaleDateString()}</div>
                                              </td>
                                             <td className="px-6 py-4">
                                                <div className="text-[11px] font-bold text-primary-red uppercase leading-none mb-1">A: {w.recipient}</div>
                                                <div className="text-[9px] text-slate-400 font-medium uppercase tracking-tight">Por: {w.performedBy}</div>
                                              </td>
                                             <td className="px-6 py-4 text-right font-black text-primary-red text-sm">-{formatCurrency(w.amountUSD)}</td>
                                           </tr>
                                         ))
                                       )}
                                    </tbody>
                                 </table>
                              </div>
                           </div>
                        </div>
                     </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
    </div>
  );
};

export default function App() {
  return (
    <div className="min-h-screen bg-[#F8FBFF] flex flex-col items-center justify-start p-4 md:p-12 relative overflow-y-auto scroll-smooth">
      {/* Decorative background blur blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-navy-blue/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-lime-accent/10 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Branding Overlay */}
      <div className="mb-14 flex flex-col items-center w-full max-w-6xl z-10">
         <div className="flex flex-col md:flex-row items-center justify-center gap-5 md:gap-7 px-4">
            {/* Section 1: TIRANTE® */}
            <div className="flex items-start">
              <span className="text-black font-black text-[38px] md:text-[48px] leading-none tracking-tight">TIRANTE</span>
              <span className="text-black font-medium text-[16px] md:text-[20px] ml-1 mt-1 md:mt-2">®</span>
            </div>

            {/* Red Separator Bar */}
            <div className="w-[2px] md:w-[3px] h-[34px] md:h-[42px] bg-[#EE1D23] mx-1 hidden md:block"></div>
            
            {/* Section 2: Bienes Raices. */}
            <div className="flex items-center h-full">
              <span className="text-navy-blue font-medium text-[18px] md:text-[28px] mt-1 md:mt-2 leading-none tracking-tight">Bienes Raices.</span>
            </div>
         </div>
         
         {/* Office Description */}
         <div className="mt-6 flex flex-col items-center text-[12px] text-navy-blue font-display font-semibold uppercase tracking-[0.2em] opacity-80">
           Oficina Pinamar: Martillero Diego Tirante
         </div>
      </div>

      <main className="w-full max-w-6xl z-10 flex flex-col gap-8 pb-20">
        <LiquidationEngine />
      </main>

      <footer className="mt-16 text-[10px] text-graphite font-bold uppercase tracking-[0.3em] flex flex-col items-center gap-3 opacity-40">
        <div>Diego Ariel Tirante • Broker Inmobiliario</div>
        <div className="flex items-center gap-2">
          <span>© 2024</span>
          <span className="w-1 h-1 bg-graphite rounded-full"></span>
          <span>tirante bienes raices</span>
        </div>
      </footer>
    </div>
  );
}
