/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  RotateCcw
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
  const [isFacturado, setIsFacturado] = useState<boolean>(false);
  
  // Dashboard & persistence
  const [savedLiquidations, setSavedLiquidations] = useState<SavedLiquidation[]>(() => {
    const saved = localStorage.getItem('tirante_liquidations');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>(() => {
    const saved = localStorage.getItem('tirante_withdrawals');
    return saved ? JSON.parse(saved) : [];
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
      // Header background White for this specific hybrid logo style
      p_doc.setFillColor(255, 255, 255);
      p_doc.rect(0, 0, 210, 40, 'F');
      
      // Red Box for TIRANTE®
      p_doc.setFillColor(212, 32, 35); // Rojo Carmesí #D42023
      p_doc.roundedRect(12, 10, 52, 16, 2, 2, 'F');
      
      p_doc.setTextColor(255, 255, 255);
      p_doc.setFontSize(24);
      p_doc.setFont('helvetica', 'bold');
      p_doc.text('TIRANTE', 15, 22);
      
      // Separate ® in white
      p_doc.setFontSize(14);
      p_doc.setFont('helvetica', 'normal');
      p_doc.text('®', 58, 19);
      
      // Red Separator Line to the right of the box
      p_doc.setLineWidth(0.6);
      p_doc.setDrawColor(212, 32, 35);
      p_doc.line(68, 10, 68, 26);
      
      // Slogan in Black
      p_doc.setTextColor(0, 0, 0);
      p_doc.setFontSize(16);
      p_doc.setFont('helvetica', 'normal');
      p_doc.text('Bienes Raices.', 72, 22);
      
      p_doc.setTextColor(10, 31, 68); // Navy Blue
      p_doc.setFontSize(8.5);
      p_doc.text('Oficina Pinamar: Martillero Diego A. Tirante', 12, 34);
      
      // Labels in Navy Blue on white background
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

  return (
    <>
      <div className="bg-brand-gray rounded-3xl p-6 shadow-xl flex flex-col h-full border border-gray-200 box-border text-navy-blue">
      {/* Header with Title */}
      <div className="mb-6 flex flex-col gap-1.5">
         <div className="flex items-center gap-3">
            <div className="bg-primary-red p-2 rounded-lg shadow-sm">
              <Calculator className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-navy-blue uppercase tracking-tight">Liquidación de Operación</h1>
         </div>
         <p className="text-xs text-graphite font-medium uppercase tracking-widest">Protocolo Interno de Gestión</p>
      </div>

      {/* Tab Switcher & Folio Indicator */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex bg-gray-200 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('ALQUILER')}
            className={`px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'ALQUILER' ? 'bg-electric-blue text-white shadow-lg' : 'text-slate-500 hover:text-navy-blue'}`}
          >
            Alquileres
          </button>
          <button 
            onClick={() => setActiveTab('VENTA')}
            className={`px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'VENTA' ? 'bg-electric-blue text-white shadow-lg' : 'text-slate-500 hover:text-navy-blue'}`}
          >
            Ventas
          </button>
        </div>

        <div className="flex-1 min-w-[200px]">
           <label className="text-[10px] text-slate-gray font-black uppercase tracking-widest pl-1 mb-1 block">Código Propiedad</label>
           <input 
            type="text" 
            className="sleek-input py-1.5 font-bold tracking-widest" 
            value={propertyCode} 
            onChange={(e) => setPropertyCode(e.target.value)} 
           />
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setIsOfficeOnly(!isOfficeOnly)}
            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${isOfficeOnly ? 'bg-primary-red border-primary-red text-white' : 'border-gray-200 text-slate-500 hover:bg-gray-200'}`}
          >
            Modo Oficina
          </button>
          <div className="flex bg-gray-200 p-1 rounded-xl">
            <button 
              onClick={() => setIsPesos(false)}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${!isPesos ? 'bg-white text-navy-blue shadow-sm' : 'text-slate-500'}`}
            >
              USD
            </button>
            <button 
              onClick={() => setIsPesos(true)}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${isPesos ? 'bg-white text-navy-blue shadow-sm' : 'text-slate-500'}`}
            >
              ARS
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Inputs */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="col-span-2 md:col-span-1">
          <label className="micro-label">
            {activeTab === 'ALQUILER' ? 'Precio de Publicación (Todo Incluido)' : 'Monto Real de Venta'} ({isPesos ? 'ARS' : 'USD'})
          </label>
          <input 
            type="number"
            className="sleek-input py-2"
            value={opAmount}
            onChange={(e) => {
              const val = Number(e.target.value);
              setOpAmount(val);
              if (activeTab === 'ALQUILER') {
                setCleaningGastos(Number((val * 0.022).toFixed(2)));
              }
            }}
          />
          {activeTab === 'ALQUILER' && (
            <p className="text-[9px] text-slate-gray mt-1 font-bold">Base Alquiler + 10% Comis. + Limpieza</p>
          )}
        </div>
        {activeTab === 'VENTA' && (
          <div className="col-span-2 md:col-span-1">
            <label className="micro-label">Valor a Escriturar (Declarar)</label>
            <input 
              type="number"
              className="sleek-input py-2"
              value={valorDeclarar}
              onChange={(e) => setValorDeclarar(Number(e.target.value))}
            />
          </div>
        )}
        <div className="col-span-2 md:col-span-1">
          <label className="micro-label">Coti Dólar</label>
          <input 
            type="number"
            className={`sleek-input py-2 ${!isPesos && 'opacity-50 pointer-events-none'}`}
            value={exchangeRate}
            onChange={(e) => setExchangeRate(Number(e.target.value))}
            disabled={!isPesos}
          />
        </div>
        
        {!isOfficeOnly && (
          <>
            <div className="col-span-2 md:col-span-1">
              <label className="micro-label">Agente Responsable</label>
              <input type="text" className="sleek-input py-2" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="micro-label">Captación del Inmueble</label>
              <select 
                className="sleek-input text-xs py-2"
                value={source}
                onChange={(e) => setSource(e.target.value as CaptationSource)}
              >
                <option value="PROPIA">Propia Agente (30%)</option>
                <option value="OFICINA">Oficina (25%)</option>
              </select>
            </div>
          </>
        )}
        
        <div className="col-span-2 md:col-span-1">
          <label className="micro-label">ID de Operación</label>
          <input type="text" className="sleek-input py-2" value={opNumber} onChange={(e) => setOpNumber(e.target.value)} />
        </div>

        {activeTab === 'ALQUILER' ? (
          <div className="col-span-2 md:col-span-1">
            <label className="micro-label">Gastos Limpieza/Fijos</label>
            <input type="number" className="sleek-input py-2" value={cleaningGastos} onChange={(e) => setCleaningGastos(Number(e.target.value))} />
          </div>
        ) : (
          <>
            <div className="col-span-2 md:col-span-1">
              <label className="micro-label">Tipo de Gastos (Escritura)</label>
              <select className="sleek-input text-xs py-2" value={saleMode} onChange={(e) => setSaleMode(e.target.value as any)}>
                <option value="COMPARTIDO">Gastos de Escritura Compartidos</option>
                <option value="LIBRE">Libre de Gastos (Total p/Comprador)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 col-span-2 md:col-span-1">
               <div>
                  <label className="micro-label">% Comisión Comprador</label>
                  <input type="number" className="sleek-input py-2" value={commCompradorPct} onChange={(e) => setCommCompradorPct(Number(e.target.value))} />
               </div>
               <div>
                  <label className="micro-label">% Comisión Vendedor</label>
                  <input type="number" className="sleek-input py-2" value={commVendedorPct} onChange={(e) => setCommVendedorPct(Number(e.target.value))} />
               </div>
            </div>
            
            <div className="col-span-2 bg-white/5 p-4 rounded-2xl border border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-gray uppercase tracking-widest">Colaboración Inmobiliaria</span>
                <button 
                  onClick={() => setIsCompartida(!isCompartida)}
                  className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all ${isCompartida ? 'bg-primary-red text-white' : 'bg-white/10 text-slate-500 hover:text-white'}`}
                >
                  {isCompartida ? 'COMISIÓN COMPARTIDA ACTIVADA' : 'OPERACIÓN PROPIA'}
                </button>
              </div>
              {isCompartida && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                   <div className="md:col-span-1">
                      <label className="micro-label">Colaborador / Tipo</label>
                      <select 
                        className="sleek-input text-xs py-1.5"
                        value={coAgencyName === 'AGENTE OFICINA' ? 'AGENTE OFICINA' : 'EXTERNO'}
                        onChange={(e) => {
                          if (e.target.value === 'AGENTE OFICINA') {
                            setCoAgencyName('AGENTE OFICINA');
                          } else {
                            setCoAgencyName('');
                          }
                        }}
                      >
                         <option value="EXTERNO">Agencia Externa (Cede 100%)</option>
                         <option value="AGENTE OFICINA">Agente de la Oficina (Split Interno)</option>
                      </select>
                   </div>
                   {coAgencyName === 'AGENTE OFICINA' && (
                     <div className="md:col-span-1">
                        <label className="micro-label text-primary-red">Nombre del 2do Agente</label>
                        <input type="text" className="sleek-input py-1.5 border-primary-red/30" value={coAgentName} onChange={(e) => setCoAgentName(e.target.value)} placeholder="Ej: Juan Pérez" />
                     </div>
                   )}
                   {coAgencyName !== 'AGENTE OFICINA' && (
                     <div className="md:col-span-1">
                        <label className="micro-label">Nombre Inmobiliaria Colega</label>
                        <input type="text" className="sleek-input py-1.5" value={coAgencyName} onChange={(e) => setCoAgencyName(e.target.value)} placeholder="Ej: Keller Williams" />
                     </div>
                   )}
                   <div className="flex gap-4 col-span-1 md:col-span-3 lg:col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer bg-white/5 p-2 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                        <input type="checkbox" checked={shareBuyer} onChange={(e) => setShareBuyer(e.target.checked)} className="accent-primary-red w-4 h-4" />
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-white uppercase leading-none">Cede Punta Compradora/Inquilino</span>
                          <span className="text-[8px] text-slate-gray mt-1 leading-tight">(Marca si el colega trae al cliente)</span>
                        </div>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer bg-white/5 p-2 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                        <input type="checkbox" checked={shareSeller} onChange={(e) => setShareSeller(e.target.checked)} className="accent-primary-red w-4 h-4" />
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-white uppercase leading-none">Cede Punta Vendedora/Propietario</span>
                          <span className="text-[8px] text-slate-gray mt-1 leading-tight">(Marca si el colega trae la propiedad)</span>
                        </div>
                      </label>
                   </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {activeTab === 'VENTA' && (
        <div className="grid grid-cols-2 gap-3 mb-6 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
           <div className="col-span-2 flex items-center justify-between mb-4 border-b border-white/5 pb-2">
              <span className="text-[10px] font-bold text-slate-gray uppercase tracking-widest">Escritura y Gastos Notariales</span>
              <button 
                onClick={() => setIsTracto(!isTracto)}
                className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all tracking-tighter ${isTracto ? 'bg-primary-red text-white shadow-lg shadow-red-900/40' : 'bg-white/5 text-slate-500 hover:text-white'}`}
              >
                {isTracto ? 'MODO TRACTO ABREVIADO (SUCESIÓN)' : 'MODO ESCRITURA DIRECTA'}
              </button>
           </div>
           
           <div className="col-span-1">
              <label className="micro-label">% Sellos (Total a dividir)</label>
              <input type="number" step="0.1" className="sleek-input py-1.5" value={escrituraPct} onChange={(e) => setEscrituraPct(Number(e.target.value))} />
           </div>
           <div className="col-span-1">
              <label className="micro-label">% Honorarios Escribanía</label>
              <input type="number" step="0.1" className="sleek-input py-1.5" value={notaryFeePct} onChange={(e) => setNotaryFeePct(Number(e.target.value))} />
           </div>
           <div className="col-span-1">
              <label className="micro-label">% ITI / Ganancias</label>
              <input type="number" step="0.1" className="sleek-input py-1.5" value={itiPct} onChange={(e) => setItiPct(Number(e.target.value))} />
           </div>
           <div className="col-span-1">
              <label className="micro-label">Estado Parcelario ($)</label>
              <input type="number" className="sleek-input py-1.5" value={parcelario} onChange={(e) => setParcelario(Number(e.target.value))} />
           </div>
           
           {isTracto && (
             <div className="col-span-2 bg-primary-red/5 p-3 rounded-xl border border-primary-red/20 mb-2">
                <label className="micro-label text-primary-red text-[9px] font-black uppercase mb-2 block tracking-widest">Costos de Tracto Abreviado (Extras Vendedor)</label>
                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="micro-label">Tasa Tracto (%)</label>
                      <input type="number" step="0.1" className="sleek-input py-1 bg-dark-blue/30 border-primary-red/20" value={tasaTractoPct} onChange={(e) => setTasaTractoPct(Number(e.target.value))} />
                   </div>
                   <div>
                      <label className="micro-label">Gastos Sucesión / Honorarios Abogado (Ref: 4%)</label>
                      <div className="text-xs font-bold text-white bg-dark-blue/30 p-2 rounded-lg border border-primary-red/10">{formatCurrency(results.type === 'VENTA' ? results.sucesionJudicial : 0)}</div>
                   </div>
                </div>
             </div>
           )}

           <div className="col-span-2 flex items-center gap-4 border-t border-white/5 pt-4 mt-2">
              <div className="flex-1">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={hasDeudas} onChange={(e) => setHasDeudas(e.target.checked)} className="w-4 h-4 accent-primary-red bg-dark-blue border-white/10 rounded" />
                  <span className="text-[10px] font-bold text-slate-gray group-hover:text-white transition-colors">RETENCIONES POR DEUDAS (ABI/ARBA/EXPENSAS)</span>
                </label>
              </div>
              {hasDeudas && (
                <div className="flex-1">
                  <input type="number" className="sleek-input py-1 text-center bg-primary-red/10 border-primary-red/30 text-white placeholder:text-white/20" value={deudasMonto} onChange={(e) => setDeudasMonto(Number(e.target.value))} placeholder="Monto Deuda" />
                </div>
              )}
           </div>

           <div className="col-span-2 grid grid-cols-2 gap-4 border-t border-white/5 pt-4 mt-2">
              <div className="col-span-1">
                 <label className="micro-label">SEÑA DE RESERVA ($)</label>
                 <input type="number" className="sleek-input py-1.5" value={reservaMonto} onChange={(e) => setReservaMonto(Number(e.target.value))} placeholder="Monto de Seña" />
              </div>
              <div className="col-span-1">
                 <label className="micro-label">Fecha de Seña</label>
                 <input type="date" className="sleek-input py-1.5 text-white/70" value={reservaFecha} onChange={(e) => setReservaFecha(e.target.value)} />
              </div>
           </div>
        </div>
      )}

      {/* Visual Explanation Trigger */}
      <div className="flex items-center gap-4 mb-6 relative group">
        <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-white/10"></div>
        <button 
          onClick={() => setShowExplanation(!showExplanation)}
          className={`group flex items-center justify-center w-12 h-12 rounded-full border border-white/20 transition-all duration-500 overflow-hidden relative ${showExplanation ? 'bg-primary-red border-primary-red' : 'hover:border-white/40 bg-dark-blue'}`}
        >
          <div className={`text-white transition-transform duration-500 ${showExplanation ? 'rotate-180' : ''}`}>
            ↓
          </div>
        </button>
        <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-white/10"></div>
        
        {/* Tooltip for context */}
        {!showExplanation && (
          <div className="absolute left-1/2 -translate-x-1/2 -top-10 bg-white text-dark-blue text-[10px] font-bold px-3 py-1 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap uppercase tracking-tighter shadow-xl pointer-events-none">
            Ver desglose de ingeniería
          </div>
        )}
      </div>

      {/* Explanation Card */}
      {showExplanation && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="mb-8 p-6 bg-white rounded-2xl shadow-2xl space-y-6"
        >
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
             <div className="w-1.5 h-6 bg-primary-red rounded-full"></div>
             <h2 className="text-sm font-bold text-dark-text uppercase tracking-tight">Ingeniería de la Liquidación</h2>
          </div>
          
          <div className="space-y-6">
            {activeTab === 'ALQUILER' ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold text-slate-gray uppercase text-center md:text-left">Liquidación para Inquilino</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center bg-dark-blue p-3 rounded-xl border border-white/10">
                      <span className="text-white text-[10px] font-bold uppercase tracking-widest">Precio Publicación:</span>
                      <span className="font-bold text-white text-lg">{formatCurrency(opAmount)}</span>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl space-y-3 border border-gray-100 shadow-sm">
                      <div className="flex justify-between text-xs border-b border-gray-100 pb-2">
                        <span className="text-gray-500">Valor Alquiler:</span>
                        <span className="font-bold text-dark-blue">{formatCurrency(results.type === 'ALQUILER' ? results.subTotalLiquidacion : 0)}</span>
                      </div>
                      <div className="flex justify-between text-xs border-b border-gray-100 pb-2">
                        <span className="text-gray-500">Honorarios Inmobiliaria (10%):</span>
                        <span className="font-bold text-primary-red">+{formatCurrency(results.type === 'ALQUILER' ? results.commInquilino : 0)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Gastos de Limpieza:</span>
                        <span className="font-bold text-dark-blue">+{formatCurrency(cleaningGastos)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold text-slate-gray uppercase text-center md:text-left">Liquidación para Propietario</h3>
                  <div className="p-4 bg-gray-50 rounded-2xl space-y-2.5 border border-gray-100 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                    <div className="flex justify-between text-[11px]">
                       <span className="text-gray-500 font-bold">Monto abonado por Inquilino:</span>
                       <span className="font-bold text-dark-blue">{formatCurrency(opAmount)}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                       <span className="text-gray-400">(-) Fondo de Limpieza:</span>
                       <span className="font-medium">-{formatCurrency(cleaningGastos)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] border-b border-gray-100 pb-2">
                       <span className="text-gray-400">(-) Comisión Inquilino:</span>
                       <span className="font-medium">-{formatCurrency(results.type === 'ALQUILER' ? results.commInquilino : 0)}</span>
                    </div>
                    
                    <div className="flex justify-between py-2 items-center">
                       <span className="text-xs font-black text-dark-blue uppercase tracking-tighter">Valor Alquiler Declarado:</span>
                       <span className="text-sm font-black text-dark-blue">{formatCurrency(results.type === 'ALQUILER' ? results.subTotalLiquidacion : 0)}</span>
                    </div>

                    <div className="flex justify-between text-[11px] border-t border-gray-100 pt-2">
                       <span className="text-red-400 font-medium">(-) Comisión Propietario (10%):</span>
                       <span className="font-medium text-primary-red">-{formatCurrency(results.type === 'ALQUILER' ? results.commPropietario : 0)}</span>
                    </div>
                    
                    <div className="border-t-2 border-dashed border-gray-200 mt-2 pt-3 flex justify-between items-center">
                      <span className="text-xs font-bold text-green-700 uppercase">Saldo Neto a Recibir:</span>
                      <span className="text-xl font-black text-green-600">{formatCurrency(results.type === 'ALQUILER' ? results.propietarioRecibe : 0)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold text-slate-gray uppercase">Masa de Comisión Agencia</h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between items-center bg-dark-blue/5 p-3 rounded-xl border border-dark-blue/10">
                      <span className="text-gray-600">Total Ingreso Agencia:</span>
                      <span className="font-bold text-primary-red leading-none">{formatCurrency(results.totalAgency)}</span>
                    </div>
                    <ul className="space-y-2 pl-2">
                       <li className="flex items-start gap-2 text-[10px]">
                         <div className="mt-1.5 w-1 h-1 bg-primary-red rounded-full"></div>
                         <p className="text-gray-500 leading-tight">10% aportado por Inquilino sobre base neta.</p>
                       </li>
                       <li className="flex items-start gap-2 text-[10px]">
                        <div className="mt-1.5 w-1 h-1 bg-primary-red rounded-full"></div>
                        <p className="text-gray-500 leading-tight">10% aportado por Propietario sobre base neta.</p>
                      </li>
                       <li className="flex items-start gap-2 border-t border-gray-100 pt-2 mt-2">
                         <div className="mt-1.5 w-1 h-1 bg-blue-500 rounded-full"></div>
                         <p className="text-blue-600 font-bold leading-tight text-[10px]">CAJA LIMPIEZA: El valor de limpieza no integra la masa de comisiones y se deposita íntegro a la caja de Limpieza.</p>
                       </li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                      <strong>Nota Gastos:</strong> Los valores notariales son simulados según usos y costumbres y sujetos a liquidación final del Escribano.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Main Results Display */}
      <div className="flex-1 bg-navy-blue rounded-3xl p-6 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Subtle decorative element */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
        
        <div className="space-y-4 relative z-10">
          <div className="flex justify-between items-center border-b border-white/10 pb-4">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-white/80 font-bold tracking-[0.2em] mb-1">Comisión Total Agencia</span>
              <span className="text-3xl font-black text-white tracking-tight leading-none">{formatCurrency(results.totalAgency)}</span>
            </div>
            {isOfficeOnly && (
               <span className="bg-primary-red text-white text-[9px] font-black px-4 py-1.5 rounded-full tracking-widest shadow-lg shadow-primary-red/20 uppercase">Gestión Oficina</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm shadow-inner group transition-all hover:bg-white/15">
              <span className="text-[9px] uppercase text-white/70 font-black mb-2 block tracking-widest leading-tight">
                 {results.type === 'ALQUILER' ? 'Propietario Recibe' : 'Valor a Recibir (Vendedor)'}
              </span>
              <span className="text-base md:text-lg font-black text-white transition-all group-hover:scale-105 origin-left inline-block">{formatCurrency(results.type === 'ALQUILER' ? results.propietarioRecibe : results.vendedorRecibe)}</span>
            </div>
            <div className="p-4 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm shadow-inner group transition-all hover:bg-white/15">
              <span className="text-[9px] uppercase text-white/70 font-black mb-2 block tracking-widest leading-tight">
                {results.type === 'ALQUILER' ? 'Publicación' : 'A Entregar (Comprador)'}
              </span>
              <span className="text-base md:text-lg font-black text-white transition-all group-hover:scale-105 origin-left inline-block">{formatCurrency(results.type === 'ALQUILER' ? opAmount : results.totalOperacion)}</span>
            </div>
          </div>
        </div>

        {/* Improved Split Breakdown */}
        <div className="space-y-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="h-[1px] flex-1 bg-white/10"></div>
            <span className="text-[9px] uppercase text-white/60 font-black tracking-[0.3em]">Distribución Interna</span>
            <div className="h-[1px] flex-1 bg-white/10"></div>
          </div>

          {!isOfficeOnly ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-white/5 px-4 py-2.5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                  <span className="text-[8px] text-white/70 uppercase font-black tracking-wider">Agente: {agentName}</span>
                  <span className="text-xs font-bold text-white">{formatCurrency(results.agent)}</span>
                </div>
                {coAgencyName === 'AGENTE OFICINA' && (
                  <div className="flex justify-between items-center bg-white/5 px-4 py-2.5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                    <span className="text-[8px] text-primary-red uppercase font-black tracking-wider">Agente 2: {coAgentName || '---'}</span>
                    <span className="text-xs font-bold text-white">{formatCurrency(results.agent2 || 0)}</span>
                  </div>
                )}
                {isCompartida && coAgencyName !== 'AGENTE OFICINA' && (
                  <div className="flex justify-between items-center bg-white/15 px-4 py-2.5 rounded-xl border border-primary-red/30 shadow-lg shadow-black/20">
                    <span className="text-[8px] text-white/90 uppercase font-black tracking-wider">Colega: {coAgencyName || 'AGENCIA'}</span>
                    <span className="text-xs font-black text-white">{formatCurrency(results.externalShareAmount || 0)}</span>
                  </div>
                )}
              </div>
              <div className="bg-primary-red p-4 rounded-2xl flex flex-col justify-center items-center text-center shadow-2xl shadow-primary-red/30 border border-white/20 hover:scale-[1.02] transition-transform">
                <span className="text-[9px] text-white/90 font-black uppercase mb-1.5 tracking-[0.2em] leading-tight opacity-70">Neto Oficina</span>
                <span className="text-xl md:text-2xl font-black text-white">{formatCurrency(results.officeNet)}</span>
              </div>
            </div>
          ) : (
            <div className="bg-primary-red p-5 rounded-2xl shadow-2xl shadow-primary-red/20 border border-white/10 text-center">
               <span className="text-[11px] text-white font-black uppercase tracking-[0.25em]">Liquidación Directa TIRANTE®</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
             <div className="bg-white/10 p-3 rounded-2xl text-center border border-white/10 hover:bg-white/15 transition-all">
                <div className="text-[8px] text-white/60 font-black uppercase mb-1.5 tracking-widest">Socio 25%</div>
                <div className="text-xs font-bold text-white">{formatCurrency(results.socio)}</div>
             </div>
             <div className="bg-white/10 p-3 rounded-2xl text-center border border-white/10 hover:bg-white/15 transition-all">
                <div className="text-[8px] text-white/60 font-black uppercase mb-1.5 tracking-widest">Gere. 25%</div>
                <div className="text-xs font-bold text-white">{formatCurrency(results.gerente)}</div>
             </div>
             <div className="bg-white/10 p-3 rounded-2xl text-center border border-white/10 hover:bg-white/15 transition-all">
                <div className="text-[8px] text-white/60 font-black uppercase mb-1.5 tracking-widest">Caja 50%</div>
                <div className="text-xs font-bold text-white">{formatCurrency(results.cajaOficina)}</div>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-6">
        <button 
          onClick={handleSaveLiquidation}
          className="flex-1 bg-light-gray text-navy-blue py-3 rounded-2xl font-bold uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all border border-gray-300 flex items-center justify-center gap-2"
        >
          <Save size={14} />
          Guardar Liquidación
        </button>
        <label className="flex items-center justify-center gap-2 bg-white/5 rounded-2xl border border-white/5 cursor-pointer hover:bg-white/10 transition-all px-4">
          <input 
            type="checkbox" 
            checked={isFacturado} 
            onChange={(e) => setIsFacturado(e.target.checked)}
            className="w-4 h-4 accent-primary-red"
          />
          <span className="text-[10px] font-bold text-slate-gray uppercase">Facturar</span>
        </label>
      </div>

      <button 
        onClick={generatePDF}
        className="w-full bg-primary-red text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs mt-3 hover:opacity-90 transition-all shadow-lg active:scale-95 shadow-primary-red/40 flex items-center justify-center gap-2"
      >
        <ClipboardList size={14} />
        Descargar Liquidación PDF
      </button>

      <button 
        onClick={async () => {
          try {
            const response = await fetch('/src/App.tsx');
            const code = await response.text();
            const blob = new Blob([code], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Tirante_BienesRaices_Codigo.txt';
            a.click();
            URL.revokeObjectURL(url);
          } catch (error) {
            alert('No se pudo obtener el código fuente. Intente copiarlo desde el editor.');
          }
        }}
        className="w-full bg-white/5 text-slate-gray py-2 rounded-xl font-bold uppercase tracking-widest text-[9px] mt-3 hover:bg-white/10 transition-all flex items-center justify-center gap-2 opacity-60 hover:opacity-100"
      >
        <span>Descargar Código Fuente (.txt)</span>
      </button>
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
            {/* HISTORICAL DASHBOARD */}
            <div className="bg-white rounded-3xl p-8 shadow-2xl border border-gray-100">
               <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="bg-brand-gray p-2.5 rounded-xl">
                      <History className="text-dark-text w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-dark-text uppercase tracking-tighter">Dashboard de Operaciones</h2>
                      <p className="text-[10px] text-slate-gray font-bold uppercase tracking-widest">Histórico de Liquidaciones Guardadas</p>
                    </div>
                  </div>
                  <button 
                    onClick={resetSystem}
                    className="flex items-center gap-2 bg-light-gray text-navy-blue px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all border border-gray-200 shadow-sm"
                  >
                    <RotateCcw size={12} />
                    Reiniciar Sistema
                  </button>
               </div>

               <div className="grid md:grid-cols-2 gap-8">
                  {/* ALQUILERES */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-dark-blue/40 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                       <TrendingUp size={12} /> Alquileres Realizados
                    </h3>
                    <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
                       <table className="w-full text-left border-collapse">
                          <thead className="bg-gray-50 uppercase text-[9px] font-black text-slate-gray tracking-widest">
                             <tr>
                                <th className="px-4 py-3">ID Operación</th>
                                <th className="px-4 py-3 text-center">Fecha</th>
                                <th className="px-4 py-3 text-right">Comisión Total</th>
                                <th className="px-4 py-3"></th>
                             </tr>
                          </thead>
                          <tbody className="text-[11px] divide-y divide-gray-50">
                             {savedLiquidations.filter(l => l.type === 'ALQUILER').length === 0 ? (
                               <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">No hay registros</td></tr>
                             ) : (
                               savedLiquidations.filter(l => l.type === 'ALQUILER').map(l => (
                                 <tr key={l.id} className="hover:bg-blue-50/30 transition-colors">
                                   <td className="px-4 py-3 font-bold text-dark-blue">
                                     <button 
                                       onClick={() => generatePDF(l)}
                                       className="hover:text-primary-red transition-colors underline decoration-dotted"
                                     >
                                       {l.opNumber}
                                     </button>
                                   </td>
                                   <td className="px-4 py-3 text-center text-gray-500">{new Date(l.date).toLocaleDateString()}</td>
                                   <td className="px-4 py-3 text-right font-black text-primary-red">{formatCurrency(l.totalAgencyUSD)}</td>
                                   <td className="px-4 py-3 text-right">
                                      <button onClick={() => deleteLiquidation(l.id)} className="text-gray-300 hover:text-primary-red transition-colors">
                                        <Trash2 size={14} />
                                      </button>
                                   </td>
                                 </tr>
                               ))
                             )}
                          </tbody>
                       </table>
                    </div>
                  </div>

                  {/* VENTAS */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-dark-blue/40 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                       <TrendingUp size={12} /> Ventas Realizadas
                    </h3>
                    <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
                       <table className="w-full text-left border-collapse">
                          <thead className="bg-gray-50 uppercase text-[9px] font-black text-slate-gray tracking-widest">
                             <tr>
                                <th className="px-4 py-3">ID Operación</th>
                                <th className="px-4 py-3 text-center">Fecha</th>
                                <th className="px-4 py-3 text-right">Comisión Total</th>
                                <th className="px-4 py-3"></th>
                             </tr>
                          </thead>
                          <tbody className="text-[11px] divide-y divide-gray-50">
                             {savedLiquidations.filter(l => l.type === 'VENTA').length === 0 ? (
                               <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">No hay registros</td></tr>
                             ) : (
                               savedLiquidations.filter(l => l.type === 'VENTA').map(l => (
                                 <tr key={l.id} className="hover:bg-red-50/30 transition-colors">
                                   <td className="px-4 py-3 font-bold text-dark-blue">
                                      <button 
                                       onClick={() => generatePDF(l)}
                                       className="hover:text-primary-red transition-colors underline decoration-dotted"
                                     >
                                       {l.opNumber}
                                     </button>
                                   </td>
                                   <td className="px-4 py-3 text-center text-gray-500">{new Date(l.date).toLocaleDateString()}</td>
                                   <td className="px-4 py-3 text-right font-black text-primary-red">{formatCurrency(l.totalAgencyUSD)}</td>
                                   <td className="px-4 py-3 text-right">
                                      <button onClick={() => deleteLiquidation(l.id)} className="text-gray-300 hover:text-primary-red transition-colors">
                                        <Trash2 size={14} />
                                      </button>
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

            {/* FINANCIAL BOXES SECTION */}
            <div className="space-y-6">
              <div className="h-[1px] w-full bg-gray-200"></div>
              <h2 className="text-center text-[10px] font-black text-navy-blue uppercase tracking-[0.5em] py-4">Centro de Gestión Financiera</h2>
              
              {/* PRIMARY BOX: TOTAL OFICINA */}
              <div className="flex justify-center mb-6">
                <button 
                  onClick={() => setActiveBox(activeBox === 'Caja Total' ? null : 'Caja Total')}
                  className="group relative flex flex-col items-center justify-between p-8 bg-white rounded-[40px] shadow-2xl border-4 border-amber-500/10 hover:border-amber-500/30 transition-all active:scale-95 w-full max-w-md overflow-hidden"
                >
                  <div className="bg-amber-500 p-4 rounded-3xl text-white mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-amber-500/40">
                    <LayoutDashboard size={32} />
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] font-black uppercase text-graphite tracking-[0.3em] block mb-2">Caja Total Oficina</span>
                    <span className="text-3xl font-black text-navy-blue">{formatCurrency(getBoxTotal('Caja Total'))}</span>
                  </div>
                  {activeBox === 'Caja Total' && <div className="absolute bottom-0 left-0 w-full h-2 bg-amber-500"></div>}
                </button>
              </div>

              {/* OTHER BOXES */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { id: 'Agente', label: 'Agente a Liquidar', icon: <Users size={16} />, color: 'bg-emerald-500', value: getBoxTotal('Agente') },
                  { id: 'Oficina', label: 'Caja Oficina', icon: <Building2 size={16} />, color: 'bg-slate-500', value: getBoxTotal('Oficina') },
                  { id: 'Socio', label: 'Caja Socio', icon: <Wallet size={16} />, color: 'bg-primary-red', value: getBoxTotal('Socio') },
                  { id: 'Gerente', label: 'Caja Gerente', icon: <Target size={16} />, color: 'bg-indigo-600', value: getBoxTotal('Gerente') },
                  { id: 'Limpieza', label: 'Caja Limpieza', icon: <ArrowDownCircle size={16} />, color: 'bg-teal-600', value: getBoxTotal('Limpieza') },
                ].map(box => (
                  <button 
                    key={box.id}
                    onClick={() => setActiveBox(activeBox === box.id ? null : box.id)}
                    className="group relative flex flex-col items-center justify-between p-5 bg-white rounded-3xl shadow-lg border border-gray-100 hover:scale-105 transition-all active:scale-95 overflow-hidden"
                  >
                    <div className={`${box.color} p-2.5 rounded-2xl text-white mb-4 group-hover:rotate-12 transition-transform`}>
                      {box.icon}
                    </div>
                    <div className="text-center">
                      <span className="text-[8px] font-black uppercase text-graphite tracking-widest block mb-1">{box.label}</span>
                      <span className="text-xs font-black text-navy-blue">{formatCurrency(box.value)}</span>
                    </div>
                    {activeBox === box.id && <div className="absolute bottom-0 left-0 w-full h-1 bg-primary-red"></div>}
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
                    <div className="bg-light-gray rounded-3xl p-8 shadow-inner border border-gray-200 relative">
                       <div className="flex justify-between items-center mb-6">
                          <h3 className="text-navy-blue font-black uppercase tracking-widest text-sm flex items-center gap-3">
                             DETALLE Caja {activeBox === 'Agente' ? 'Agente a Liquidar' : activeBox}
                          </h3>
                          <button 
                            onClick={() => handleWithdrawal(activeBox)}
                            className="bg-primary-red text-white px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-transform"
                          >
                            Realizar Retiro
                          </button>
                       </div>

                       <div className="grid lg:grid-cols-2 gap-8">
                          {/* INCOMES */}
                          <div className="space-y-4">
                             <h4 className="text-[10px] text-emerald-400 font-black uppercase tracking-widest border-l-2 border-emerald-400 pl-3">Ingresos por Operación</h4>
                             <div className="bg-white/5 rounded-2xl overflow-hidden">
                                <table className="w-full text-left border-collapse text-[10px]">
                                   <thead className="bg-white/10 text-white/50 uppercase font-black">
                                      <tr>
                                        <th className="px-4 py-3">{activeBox === 'Agente' ? 'Agente' : 'Tipo / Prop.'}</th>
                                        <th className="px-4 py-3">ID / Fecha</th>
                                        <th className="px-4 py-3 text-right">Monto</th>
                                      </tr>
                                   </thead>
                                   <tbody className="text-white/80 divide-y divide-white/5">
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
                                        <tr key={entry.id}>
                                          <td className="px-4 py-3">
                                            <div className="font-bold uppercase">{entry.label}</div>
                                            <div className="text-[8px] text-white/40 tracking-wider">{entry.subLabel}</div>
                                          </td>
                                          <td className="px-4 py-3">
                                            <button 
                                              onClick={() => generatePDF(entry.snapshot)}
                                              className="font-bold underline decoration-dotted hover:text-primary-red transition-colors"
                                            >
                                              {entry.op}
                                            </button>
                                            <div className="text-[8px] opacity-40">{new Date(entry.date).toLocaleDateString()}</div>
                                          </td>
                                          <td className="px-4 py-3 text-right font-black text-emerald-400">+{formatCurrency(entry.amount)}</td>
                                        </tr>
                                      ))}
                                   </tbody>
                                </table>
                             </div>
                          </div>

                          {/* WITHDRAWALS */}
                          <div className="space-y-4">
                             <h4 className="text-[10px] text-primary-red font-black uppercase tracking-widest border-l-2 border-primary-red pl-3">Retiros Realizados</h4>
                             <div className="bg-white/5 rounded-2xl overflow-hidden">
                                <table className="w-full text-left border-collapse text-[10px]">
                                   <thead className="bg-white/10 text-white/50 uppercase font-black">
                                      <tr>
                                        <th className="px-4 py-3">ID / Fecha</th>
                                        <th className="px-4 py-3">Entregado a / Responsable</th>
                                        <th className="px-4 py-3 text-right">Monto</th>
                                      </tr>
                                   </thead>
                                   <tbody className="text-white/80 divide-y divide-white/5">
                                      {withdrawals.filter(w => w.boxId === activeBox).length === 0 ? (
                                        <tr><td colSpan={3} className="px-4 py-8 text-center opacity-40 font-bold uppercase">No hay retiros registrados</td></tr>
                                      ) : (
                                        withdrawals.filter(w => w.boxId === activeBox).map(w => (
                                          <tr key={w.id}>
                                            <td className="px-4 py-3">
                                               <div className="font-bold">{w.id}</div>
                                               <div className="text-[8px] opacity-40">{new Date(w.date).toLocaleDateString()}</div>
                                             </td>
                                            <td className="px-4 py-3">
                                               <div className="font-bold text-primary-red uppercase leading-tight">A: {w.recipient}</div>
                                               <div className="text-[8px] opacity-40 uppercase tracking-widest leading-tight">Por: {w.performedBy}</div>
                                             </td>
                                            <td className="px-4 py-3 text-right font-black text-primary-red">-{formatCurrency(w.amountUSD)}</td>
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
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default function App() {
  return (
    <div className="min-h-screen bg-bg-gray flex flex-col items-center justify-center p-4 md:p-8">
      {/* Branding Overlay */}
      <div className="mb-14 flex flex-col items-center w-full max-w-5xl">
         <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-5 px-4">
            {/* Red Box for TIRANTE® */}
            <div className="bg-primary-red rounded-xl md:rounded-2xl px-5 py-3 md:px-8 md:py-6 flex items-center shadow-xl shadow-primary-red/15 border border-primary-red/10">
              <div className="flex items-start">
                <span className="text-white font-bold text-[34px] md:text-[54px] leading-none tracking-tight">TIRANTE</span>
                <span className="text-white font-normal text-[14px] md:text-[21px] ml-1 mt-1 md:mt-2">®</span>
              </div>
            </div>

            {/* Red Separator Bar */}
            <div className="w-[1.5px] md:w-[2.5px] h-[32px] md:h-[50px] bg-primary-red self-center mx-2 hidden md:block"></div>
            
            {/* Slogan in Black */}
            <div className="text-black font-medium text-[18px] md:text-[27px] leading-none flex items-center h-full">
              Bienes Raices.
            </div>
         </div>
         
         {/* Office Description */}
         <div className="mt-8 flex flex-col items-center text-[10px] text-navy-blue font-black uppercase tracking-[0.3em] opacity-80">
           Oficina Pinamar: Martillero Diego A. Tirante
         </div>
      </div>

      <main className="w-full max-w-5xl h-auto">
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
