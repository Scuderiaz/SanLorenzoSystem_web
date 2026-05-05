import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const CONTACT_BARANGAYS = [
  'Daculang Bolo',
  'Dagotdotan',
  'Laniton',
  'Langga',
  'Maisog',
  'Mampurog',
  'Matacong',
  'San Isidro',
  'San Ramon',
];
const CONTACT_SUBJECTS = [
  'New Connection Inquiry',
  'Billing Concern',
  'Meter Reading Concern',
  'Service Interruption',
  'Leakage Report',
  'Follow-up Request',
  'Other',
];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Service modal state
  const [selectedService, setSelectedService] = useState<string | null>(null);

  // Contact form state
  const [formData, setFormData] = useState({
    fullName: '',
    barangay: '',
    contactNumber: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Apply modal state
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyStep, setApplyStep] = useState<1 | 2>(1);
  const [applyForm, setApplyForm] = useState({
    firstName: '', middleName: '', lastName: '', phone: '',
    purok: '', barangay: '', municipality: 'San Lorenzo Ruiz', zipCode: '4610',
  });
  const [scheduleData, setScheduleData] = useState<{ date: string; slot: string }>({ date: '', slot: '' });
  const [applyError, setApplyError] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applySuccess, setApplyTicketNumber] = useState('');

  // Calendar state for apply modal
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const MORNING_SLOTS = ['08:00–08:30','08:30–09:00','09:00–09:30','09:30–10:00','10:00–10:30','10:30–11:00'];
  const AFTERNOON_SLOTS = ['01:00–01:30','01:30–02:00','02:00–02:30','02:30–03:00','03:00–03:30','03:30–04:00'];

  const today = new Date();
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const selectDate = (d: number) => {
    const dt = new Date(calYear, calMonth, d);
    if (dt.getDay() === 0 || dt < new Date(today.getFullYear(), today.getMonth(), today.getDate())) return;
    setScheduleData(s => ({ ...s, date: `${MONTHS[calMonth]} ${d}, ${calYear}` }));
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleData.date || !scheduleData.slot) {
      setApplyError('Please select an inspection date and time slot.');
      return;
    }
    setApplyLoading(true);
    setApplyError('');
    try {
      const res = await fetch('/api/consumer/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...applyForm, preferredDate: scheduleData.date, preferredSlot: scheduleData.slot }),
      });
      const data = await res.json();
      if (data?.success) {
        setApplyTicketNumber(data.ticketNumber);
      } else {
        setApplyError(data?.message || 'Submission failed. Please try again.');
      }
    } catch {
      setApplyError('Failed to submit. Please try again.');
    } finally {
      setApplyLoading(false);
    }
  };

  // Service data with full details
  const servicesData = {
    'water-supply': {
      title: 'Water Supply',
      image: '/images/water-supply.png',
      description: 'Provision of potable water to residential, commercial, and institutional concessionaires within the service area.',
      details: [
        '24/7 continuous water supply for all registered consumers',
        'Regular water quality testing and monitoring',
        'Pressure maintenance for consistent flow',
        'Emergency backup supply during maintenance',
        'Service coverage across all 12 barangays',
        'Minimum pressure standards compliance'
      ],
      requirements: [
        'Valid ID (Barangay Clearance or Government ID)',
        'Proof of residence or business ownership',
        'Completed application form'
      ],
      fees: 'Connection fee based on classification'
    },
    'monthly-billing': {
      title: 'Monthly Billing',
      image: '/images/billing.png',
      description: 'Monthly meter reading and billing for all registered concessionaires based on actual consumption.',
      details: [
        'Accurate monthly meter reading by trained personnel',
        'Online bill viewing through Consumer portal',
        'Multiple payment options (office, online, mobile)',
        'Detailed billing breakdown and usage history',
        'SMS/email notifications for bill generation',
        'Dispute resolution for billing concerns'
      ],
      requirements: [
        'Active water service connection',
        'Updated contact information',
        'Accessible meter location'
      ],
      fees: 'Monthly consumption-based billing'
    },
    'new-connection': {
      title: 'New Water Connection',
      image: '/images/connection.png',
      description: 'Processing of applications for new water connections including site inspection and installation.',
      details: [
        'Site inspection and feasibility assessment',
        'Professional meter installation by trained technicians',
        'Connection to nearest water main line',
        'Water quality testing before activation',
        'Consumer orientation on proper water usage',
        'Issuance of official receipt and contract'
      ],
      requirements: [
        'Barangay Clearance',
        "Valid ID (Passport, Driver's License, etc.)",
        'Proof of property ownership or lease',
        'Sedula or Tax Certificate',
        '2x2 ID photo (2 copies)',
        'Completed application form with classification'
      ],
      fees: 'Connection Fee: PHP 300, Membership Fee: PHP 50, Meter Deposit: PHP 1,500'
    },
    'reconnection': {
      title: 'Reconnection Service',
      image: '/images/disconnection.png',
      description: 'Processing of water reconnection upon settlement of outstanding balance.',
      details: [
        'Quick reconnection within 24-48 hours after payment',
        'Online payment verification system',
        'Flexible payment arrangements for large balances',
        'Automatic reconnection scheduling',
        'Clearance issuance after reconnection',
        'Prevention of future disconnection advice'
      ],
      requirements: [
        'Full payment of outstanding balance',
        'Valid ID for verification',
        'Updated contact information',
        'Cleared previous violations (if any)'
      ],
      fees: 'Reconnection fee may apply based on disconnection duration'
    },
    'repair-services': {
      title: 'Repair Services',
      image: '/images/repair.png',
      description: 'Addressing reported water line issues such as leakages and main line problems within the service area.',
      details: [
        '24/7 emergency repair hotline',
        'Rapid response team for major leaks',
        'Scheduled maintenance of main lines',
        'Free repair for system-owned infrastructure',
        'Consumer education on leak prevention',
        'Water conservation tips and assistance'
      ],
      requirements: [
        'Detailed report of the issue/location',
        'Contact information for coordination',
        'Accessibility to the repair site',
        'For private lines: authorization letter'
      ],
      fees: 'Free for main line issues; Private line repairs may incur costs'
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock body scroll when modals are open
  useEffect(() => {
    if (selectedService || showApplyModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedService, showApplyModal]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess(false);
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/public/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formData.fullName.trim(),
          barangay: formData.barangay.trim(),
          contactNumber: formData.contactNumber.trim(),
          subject: formData.subject.trim(),
          message: formData.message.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setSubmitError(String(data?.message || 'Failed to send your message. Please try again.'));
        return;
      }

      setSubmitSuccess(true);
      setFormData({ fullName: '', barangay: '', contactNumber: '', subject: '', message: '' });
      setTimeout(() => setSubmitSuccess(false), 5000);
    } catch {
      setSubmitError('Unable to connect to the server right now. Please try again in a moment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="landing-page">
      {/* ─── Navigation ─── */}
      <nav className={`landing-nav ${isScrolled ? 'scrolled' : ''}`}>
        <div className="nav-container">
          <div className="nav-logo" onClick={() => scrollToSection('hero')}>
            <img src="/slr-logo.png" alt="San Lorenzo Ruiz Water Billing" />
          </div>

          <div className="nav-links-wrapper">
            <ul className={`nav-links ${mobileMenuOpen ? 'open' : ''}`}>
              <li><button onClick={() => scrollToSection('about')}>About</button></li>
              <li><button onClick={() => scrollToSection('services')}>Services</button></li>
              <li><button onClick={() => scrollToSection('apply')}>How to Apply</button></li>
              <li><button onClick={() => scrollToSection('location')}>Location</button></li>
              <li><button onClick={() => scrollToSection('schedule')}>Office Hours</button></li>
              <li><button onClick={() => scrollToSection('contact')}>Contact</button></li>
              <li className="mobile-auth">
                <button className="btn-mobile-signup" onClick={() => { navigate('/signup'); setMobileMenuOpen(false); }}>Sign Up</button>
                <button className="btn-mobile-login" onClick={() => { navigate('/login'); setMobileMenuOpen(false); }}>Log In</button>
              </li>
            </ul>
          </div>

          <div className="nav-auth">
            <button className="btn-signin" onClick={() => navigate('/signup')}>Sign Up</button>
            <button className="btn-login" onClick={() => navigate('/login')}>Log In</button>
          </div>

          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <i className={`fas ${mobileMenuOpen ? 'fa-times' : 'fa-bars'}`} />
          </button>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section id="hero" className="hero-section">
        <div className="hero-bg">
          <img src="/images/Landing-bg3.png" alt="Water background" />
        </div>
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="hero-text">
            <h1 className="hero-title">
              <span className="title-main">SAN LORENZO RUIZ</span>
              <span className="title-sub">WATER BILLING</span>
            </h1>
            <p className="hero-description">
              Providing reliable, clean, and accessible water services to our community.
              Manage your water billing, apply for a new connection, and stay informed all in one place.
            </p>
            <div className="hero-buttons">
              <button
                className="btn-apply"
                onClick={() => {
                  setApplyStep(1);
                  setScheduleData({ date: '', slot: '' });
                  setApplyError('');
                  setApplyTicketNumber('');
                  setShowApplyModal(true);
                }}
              >
                APPLY NOW
              </button>
              <button className="btn-contact" onClick={() => scrollToSection('contact')}>CONTACT US</button>
            </div>
          </div>
          <div className="hero-logo">
            <img src="/images/SLR Logo - BIG.png" alt="San Lorenzo Ruiz Seal" />
          </div>
        </div>
      </section>

      {/* ─── About Section ─── */}
      <section id="about" className="about-section">
        <div className="section-container">
          <div className="about-content">
            <div className="about-text">
              <span className="section-label">Who We Are</span>
              <h2 className="section-title">
                SERVING OUR COMMUNITY<br />
                WITH CLEAN WATER ACCESS
              </h2>
              <p className="about-lead">
                Providing reliable, clean, and accessible water services to our community.
                Manage your water billing, apply for a new connection, and stay informed all in one place.
              </p>
              <p className="about-description">
                The San Lorenzo Ruiz Water Billing Office manages water supply, billing, and new connection
                services for residents and businesses within our coverage area. Our office is committed
                to transparency, efficiency, and quality service delivery.
              </p>
              <p className="about-description">
                We handle all water-related concerns including monthly billing, meter reading, application
                for new connections, water disconnection and reconnection requests, and assistance with billing disputes.
              </p>
              <p className="about-description">
                Our team works tirelessly to ensure that every member of our community has access to
                potable water — a basic necessity and a fundamental right.
              </p>
            </div>
            <div className="about-image">
              <img src="/images/meters.png" alt="Water meters" />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Services Offered Section ─── */}
      <section id="services" className="services-section">
        <div className="section-container">
          <div className="services-header">
            <span className="section-label blue">What We Offer</span>
            <h2 className="section-title dark">SERVICES OFFERED</h2>
            <p className="section-subtitle dark">
              We provide essential water services to households, businesses, and institutions across San Lorenzo Ruiz.
            </p>
          </div>

          <div className="services-slider-container">
            <button className="slider-btn slider-prev" onClick={() => {
              const slider = document.querySelector('.services-slider');
              if (slider) slider.scrollBy({ left: -320, behavior: 'smooth' });
            }}>
              <i className="fas fa-chevron-left"></i>
            </button>

            <div className="services-slider">
              <div className="service-card" onClick={() => setSelectedService('water-supply')} role="button" tabIndex={0}>
                <h3 className="service-title">WATER SUPPLY</h3>
                <div className="service-image"><img src="/images/water-supply.png" alt="Water Supply" /></div>
                <p className="service-description">Provision of potable water to residential, commercial, and institutional concessionaires within the service area.</p>
              </div>
              <div className="service-card" onClick={() => setSelectedService('monthly-billing')} role="button" tabIndex={0}>
                <h3 className="service-title">MONTHLY BILLING</h3>
                <div className="service-image"><img src="/images/billing.png" alt="Monthly Billing" /></div>
                <p className="service-description">Monthly meter reading and billing for all registered concessionaires based on actual consumption.</p>
              </div>
              <div className="service-card" onClick={() => setSelectedService('new-connection')} role="button" tabIndex={0}>
                <h3 className="service-title">NEW WATER CONNECTION</h3>
                <div className="service-image"><img src="/images/connection.png" alt="New Water Connection" /></div>
                <p className="service-description">Processing of applications for new water connections including site inspection and installation.</p>
              </div>
              <div className="service-card" onClick={() => setSelectedService('reconnection')} role="button" tabIndex={0}>
                <h3 className="service-title">RECONNECTION</h3>
                <div className="service-image"><img src="/images/disconnection.png" alt="Reconnection" /></div>
                <p className="service-description">Processing of water reconnection upon settlement of outstanding balance.</p>
              </div>
              <div className="service-card" onClick={() => setSelectedService('repair-services')} role="button" tabIndex={0}>
                <h3 className="service-title">REPAIR SERVICES</h3>
                <div className="service-image"><img src="/images/repair.png" alt="Repair Services" /></div>
                <p className="service-description">Addressing reported water line issues such as leakages and main line problems within the service area.</p>
              </div>
            </div>

            <button className="slider-btn slider-next" onClick={() => {
              const slider = document.querySelector('.services-slider');
              if (slider) slider.scrollBy({ left: 320, behavior: 'smooth' });
            }}>
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>

          {/* Service Detail Modal */}
          {selectedService && (
            <div className="service-modal-overlay" onClick={() => setSelectedService(null)}>
              <div className="service-modal" onClick={(e) => e.stopPropagation()}>
                <button className="service-modal-close" onClick={() => setSelectedService(null)}>
                  <i className="fas fa-times"></i>
                </button>
                {(() => {
                  const service = servicesData[selectedService as keyof typeof servicesData];
                  return (
                    <div className="service-modal-content">
                      <div className="service-modal-header">
                        <img src={service.image} alt={service.title} />
                        <h2>{service.title}</h2>
                      </div>
                      <p className="service-modal-description">{service.description}</p>
                      <div className="service-modal-section">
                        <h3><i className="fas fa-check-circle"></i> Service Details</h3>
                        <ul>{service.details.map((detail, idx) => <li key={idx}>{detail}</li>)}</ul>
                      </div>
                      <div className="service-modal-section">
                        <h3><i className="fas fa-file-alt"></i> Requirements</h3>
                        <ul>{service.requirements.map((req, idx) => <li key={idx}>{req}</li>)}</ul>
                      </div>
                      <div className="service-modal-fees">
                        <h3><i className="fas fa-money-bill-wave"></i> Fees</h3>
                        <p>{service.fees}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── Application Process Section ─── */}
      <section id="apply" className="apply-section">
        <div className="section-bg">
          <img src="/images/Landing-bg4.png" alt="Application background" />
        </div>
        <div className="section-overlay" />
        <div className="section-container">
          <div className="apply-header">
            <span className="section-label light">Application Process</span>
            <h2 className="section-title light">HOW TO APPLY FOR<br />WATER CONNECTION</h2>
            <p className="section-subtitle light">
              Getting a water connection is simple. Follow these steps and our staff will guide you through the process.
            </p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">01</div>
              <h3 className="step-title">Visit the Office or<br />Apply Online</h3>
              <p className="step-description">Come to our office in person or submit your application through our water billing system.</p>
              <p className="step-description">Either way, we'll walk you through everything you need to get started with your new water connection.</p>
            </div>
            <div className="step-card">
              <div className="step-number">02</div>
              <h3 className="step-title">Fill Out the<br />Application Form</h3>
              <p className="step-description">Complete the application form and prepare your requirements: a valid Cedula and the total payment of ₱1,850 (₱300 connection fee, ₱50 membership fee, ₱1,500 water meter).</p>
              <p className="step-description">Necessary pipe materials will be determined during the inspection.</p>
            </div>
            <div className="step-card">
              <div className="step-number">03</div>
              <h3 className="step-title">Site<br />Inspection</h3>
              <p className="step-description">A site inspection will be conducted the next day after your application is submitted to verify your property's eligibility for connection.</p>
            </div>
            <div className="step-card">
              <div className="step-number">04</div>
              <h3 className="step-title"><br />Installation</h3>
              <p className="step-description">Once the inspection is cleared, our team will proceed with the installation of your water connection and meter at your property.</p>
            </div>
          </div>

          <div className="requirements-row">
            <div className="requirements-card">
              <h3 className="req-title">REQUIREMENTS & FEES</h3>
              <p className="req-subtitle">Please bring the following when applying:</p>
              <ul className="req-list">
                <li><i className="fas fa-check-circle" /> Duly accomplished application form (available at the office)</li>
                <li><i className="fas fa-check-circle" /> Valid Cedula (Community Tax Certificate)</li>
                <li><i className="fas fa-check-circle" /> Connection Fee — ₱300</li>
                <li><i className="fas fa-check-circle" /> Membership Fee — ₱50</li>
                <li><i className="fas fa-check-circle" /> Water Meter (Contador) — ₱1,500</li>
                <li><i className="fas fa-check-circle" /> Total Payment: ₱1,850</li>
              </ul>
            </div>
            <div className="note-card">
              <h3 className="note-title">NOTE:</h3>
              <p className="note-text">Materials for the connection are to be purchased by the applicant (Consumer). Please contact our office for more details on material requirements specific to your property.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Location Section ─── */}
      <section id="location" className="location-section">
        <div className="section-container">
          <div className="location-header">
            <span className="section-label blue">Where to Find Us</span>
            <h2 className="section-title dark">VISIT OUR OFFICE</h2>
            <p className="section-subtitle dark">
              We are conveniently located and accessible to all residents in our service area. Feel free to drop by during office hours.
            </p>
          </div>
          <div className="location-content">
            <div className="location-map">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d342.1230807360523!2d122.86869180329732!3d14.036925205837619!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3398a7001dff8499%3A0x281c46c3c37083b9!2sMunicipal%20Hall!5e0!3m2!1sen!2sph!4v1776854940155!5m2!1sen!2sph"
                width="100%"
                height="450"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="San Lorenzo Ruiz Municipal Hall Location"
              />
            </div>
            <div className="location-info-card">
              <div className="info-block">
                <h4 className="info-title">ADDRESS</h4>
                <p className="info-text">San Lorenzo Ruiz Water Billing Office<br />Barangay San Lorenzo Ruiz<br />Camarines Norte, Philippines</p>
              </div>
              <div className="info-block">
                <h4 className="info-title">PHONE / CONTACT</h4>
                <p className="info-text">09123456789</p>
              </div>
              <div className="info-block">
                <h4 className="info-title">INQUIRIES</h4>
                <p className="info-text">Contact us in person at the billing office or through our system</p>
              </div>
              <div className="info-block">
                <h4 className="info-title">HOW TO GET HERE</h4>
                <p className="info-text">Our office is located inside the San Lorenzo Ruiz Municipal Hall. From Camambugan Terminal, ride a jeepney going to San Lorenzo Ruiz and get off in front of the Parish Church. Walk inside the Municipal Hall and look for the Water Billing Office. You may ask any personnel inside for directions.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Office Hours Section ─── */}
      <section id="schedule" className="schedule-section">
        <div className="section-bg">
          <img src="/images/Landing-bg4.png" alt="Schedule background" />
        </div>
        <div className="section-overlay" />
        <div className="section-container">
          <div className="schedule-header">
            <span className="section-label yellow">Schedule</span>
            <h2 className="section-title light">OFFICE HOURS &<br />IMPORTANT DATES</h2>
            <p className="section-subtitle light">Plan your visit accordingly. Walk-in services are available during regular office hours.</p>
          </div>
          <div className="schedule-grid">
            <div className="schedule-card office-hours">
              <h3 className="schedule-card-title"><i className="fas fa-clock" /> Regular Office Hours</h3>
              <div className="hours-list">
                <div className="hours-row"><span>Monday</span><span>8:00 AM – 5:00 PM</span></div>
                <div className="hours-row"><span>Tuesday</span><span>8:00 AM – 5:00 PM</span></div>
                <div className="hours-row"><span>Wednesday</span><span>8:00 AM – 5:00 PM</span></div>
                <div className="hours-row"><span>Thursday</span><span>8:00 AM – 5:00 PM</span></div>
                <div className="hours-row"><span>Friday</span><span>8:00 AM – 5:00 PM</span></div>
                <div className="hours-row closed"><span>Saturday</span><span>Closed</span></div>
                <div className="hours-row closed"><span>Sunday</span><span>Closed</span></div>
              </div>
            </div>
            <div className="schedule-info-cards">
              <div className="schedule-card billing-schedule">
                <h3 className="schedule-card-title"><i className="fas fa-calendar-alt" /> Billing & Payment Schedule</h3>
                <div className="schedule-table">
                  <div className="schedule-row"><span>Billing Period</span><span>Monthly</span></div>
                  <div className="schedule-row"><span>Meter Reading</span><span>1st–2nd week of the month</span></div>
                  <div className="schedule-row"><span>Due Date</span><span>3rd–last week of the month</span></div>
                  <div className="schedule-row"><span>Penalty (if unpaid)</span><span>+10% (one time only)</span></div>
                  <div className="schedule-row"><span>Disconnection</span><span>After 3 consecutive unpaid months</span></div>
                  <div className="schedule-row"><span>Reconnection Fee</span><span>₱50</span></div>
                </div>
              </div>
              <div className="schedule-card other-info">
                <h3 className="schedule-card-title"><i className="fas fa-info-circle" /> Other Important Info</h3>
                <div className="schedule-table">
                  <div className="schedule-row"><span>Penalty</span><span>10% of bill (once only)</span></div>
                  <div className="schedule-row"><span>Disconnection Threshold</span><span>3 consecutive missed payments</span></div>
                  <div className="schedule-row"><span>Illegal Connection Fine</span><span>₱2,500</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Contact Section ─── */}
      <section id="contact" className="contact-section">
        <div className="section-container">
          <div className="contact-header">
            <span className="section-label blue">Get In Touch</span>
            <h2 className="section-title dark">HAVE QUESTIONS OR NEED ASSISTANCE?</h2>
            <p className="section-subtitle dark">
              Our team is here to help. <span className="highlight">Visit us</span> during office hours or{' '}
              <span className="highlight">fill out the form below</span> and our staff will get back to you as soon as possible.
            </p>
          </div>
          <form className="contact-form" onSubmit={handleContactSubmit}>
            <div className="form-grid">
              <div className="form-left">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input type="text" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Barangay</label>
                  <select value={formData.barangay} onChange={(e) => setFormData({...formData, barangay: e.target.value})} required>
                    <option value="">Select barangay</option>
                    {CONTACT_BARANGAYS.map((barangay) => (
                      <option key={barangay} value={barangay}>
                        {barangay}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Contact Number</label>
                  <input
                    type="tel"
                    value={formData.contactNumber}
                    onChange={(e) => setFormData({...formData, contactNumber: e.target.value})}
                    placeholder="09XXXXXXXXX"
                    maxLength={13}
                    required
                  />
                </div>
              </div>
              <div className="form-right">
                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <select value={formData.subject} onChange={(e) => setFormData({...formData, subject: e.target.value})} required>
                    <option value="">Select subject</option>
                    {CONTACT_SUBJECTS.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Message</label>
                  <textarea value={formData.message} onChange={(e) => setFormData({...formData, message: e.target.value})} rows={5} required />
                </div>
                <div className="form-group">
                  <button type="submit" className="btn-submit" disabled={isSubmitting}>
                    {isSubmitting ? 'SUBMITTING...' : 'SUBMIT'}
                  </button>
                </div>
              </div>
            </div>
            {submitSuccess && (
              <div className="form-success">
                <i className="fas fa-check-circle" /> Thank you! Your message has been sent successfully.
              </div>
            )}
            {submitError && (
              <div className="form-error">
                <i className="fas fa-exclamation-circle" /> {submitError}
              </div>
            )}
          </form>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="landing-footer">
        <div className="footer-bg">
          <img src="/images/Landing-bg3.png" alt="Footer background" />
        </div>
        <div className="footer-overlay" />
        <div className="footer-content">
          <p>© 2026 San Lorenzo Ruiz Water Billing Office. All rights reserved. | Serving our community with clean water access.</p>
        </div>
      </footer>

      {/* ─── Apply Modal ─── */}
      {showApplyModal && (
        <div className="apply-modal-overlay" onClick={() => setShowApplyModal(false)}>
          <div className="apply-modal" onClick={e => e.stopPropagation()}>
            <button className="apply-modal-close" onClick={() => setShowApplyModal(false)}>
              <i className="fas fa-times" />
            </button>

            <div className="apply-modal-header">
              <h2>
                {applySuccess ? 'Application Submitted!' :
                  applyStep === 1 ? 'Apply for Water Connection' : 'Schedule Inspection'}
              </h2>
            </div>

            <div className="apply-modal-body">
              {applySuccess ? (
                <div className="apply-success-view">
                  <i className="fas fa-check-circle" style={{ fontSize: 52, color: '#16a34a', display: 'block', marginBottom: 16 }} />
                  <p>Your application has been received and is now pending review by the office.</p>
                  <div className="apply-ticket-number">{applySuccess}</div>
                  {scheduleData.date && (
                    <p style={{ fontSize: 13, color: '#64748b', marginTop: 12 }}>
                      <i className="fas fa-calendar-check" style={{ color: '#2563eb', marginRight: 6 }} />
                      Inspection scheduled: <strong>{scheduleData.date}</strong> at <strong>{scheduleData.slot}</strong>
                    </p>
                  )}
                  <button className="apply-modal-btn-primary" onClick={() => setShowApplyModal(false)}>Done</button>
                </div>
              ) : applyStep === 1 ? (
                <div className="apply-step-view">
                  <div className="apply-steps-indicator">
                    <div className="apply-step-dot active"><span>1</span> Personal Details</div>
                    <div className="apply-step-line" />
                    <div className="apply-step-dot"><span>2</span> Schedule</div>
                  </div>
                  {applyError && <div className="apply-error"><i className="fas fa-exclamation-circle" /> {applyError}</div>}
                  <div className="apply-form-grid">
                    <div className="apply-field">
                      <label>First Name *</label>
                      <input type="text" value={applyForm.firstName} onChange={e => setApplyForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" />
                    </div>
                    <div className="apply-field">
                      <label>Middle Name</label>
                      <input type="text" value={applyForm.middleName} onChange={e => setApplyForm(f => ({ ...f, middleName: e.target.value }))} placeholder="Optional" />
                    </div>
                    <div className="apply-field full">
                      <label>Last Name *</label>
                      <input type="text" value={applyForm.lastName} onChange={e => setApplyForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" />
                    </div>
                    <div className="apply-field full">
                      <label>Contact Number *</label>
                      <input type="tel" value={applyForm.phone} onChange={e => setApplyForm(f => ({ ...f, phone: e.target.value }))} placeholder="09XXXXXXXXX" />
                    </div>
                    <div className="apply-field">
                      <label>Barangay *</label>
                      <select
                        value={applyForm.barangay}
                        onChange={e => setApplyForm(f => ({ ...f, barangay: e.target.value, purok: '' }))}
                        className="apply-select"
                      >
                        <option value="">Select Barangay</option>
                        <option value="Daculang Bolo">Daculang Bolo</option>
                        <option value="Dagotdotan">Dagotdotan</option>
                        <option value="Laniton">Laniton</option>
                        <option value="Langga">Langga</option>
                        <option value="Maisog">Maisog</option>
                        <option value="Mampurog">Mampurog</option>
                        <option value="Matacong">Matacong</option>
                        <option value="San Isidro">San Isidro</option>
                        <option value="San Ramon">San Ramon</option>
                      </select>
                    </div>
                    <div className="apply-field">
                      <label>Purok *</label>
                      <select
                        value={applyForm.purok}
                        onChange={e => setApplyForm(f => ({ ...f, purok: e.target.value }))}
                        className="apply-select"
                        disabled={!applyForm.barangay}
                      >
                        <option value="">
                          {applyForm.barangay ? 'Select Purok' : 'Select Barangay first'}
                        </option>
                        {applyForm.barangay === 'Daculang Bolo' && Array.from({ length: 8 }, (_, i) => <option key={i+1} value={`Purok ${i+1}`}>Purok {i+1}</option>)}
                        {applyForm.barangay === 'Dagotdotan' && Array.from({ length: 7 }, (_, i) => <option key={i+1} value={`Purok ${i+1}`}>Purok {i+1}</option>)}
                        {applyForm.barangay === 'Laniton' && Array.from({ length: 5 }, (_, i) => <option key={i+1} value={`Purok ${i+1}`}>Purok {i+1}</option>)}
                        {applyForm.barangay === 'Langga' && Array.from({ length: 2 }, (_, i) => <option key={i+1} value={`Purok ${i+1}`}>Purok {i+1}</option>)}
                        {applyForm.barangay === 'Maisog' && Array.from({ length: 3 }, (_, i) => <option key={i+1} value={`Purok ${i+1}`}>Purok {i+1}</option>)}
                        {applyForm.barangay === 'Mampurog' && Array.from({ length: 6 }, (_, i) => <option key={i+1} value={`Purok ${i+1}`}>Purok {i+1}</option>)}
                        {applyForm.barangay === 'Matacong' && Array.from({ length: 7 }, (_, i) => <option key={i+1} value={`Purok ${i+1}`}>Purok {i+1}</option>)}
                        {applyForm.barangay === 'San Isidro' && Array.from({ length: 4 }, (_, i) => <option key={i+1} value={`Purok ${i+1}`}>Purok {i+1}</option>)}
                        {applyForm.barangay === 'San Ramon' && Array.from({ length: 3 }, (_, i) => <option key={i+1} value={`Purok ${i+1}`}>Purok {i+1}</option>)}
                      </select>
                    </div>
                    <div className="apply-field">
                      <label>Municipality</label>
                      <input type="text" value="San Lorenzo Ruiz" readOnly className="apply-input-locked" />
                    </div>
                    <div className="apply-field">
                      <label>ZIP Code</label>
                      <input type="text" value="4610" readOnly className="apply-input-locked" />
                    </div>
                  </div>
                  <div className="apply-modal-footer">
                    <button className="apply-modal-btn-secondary" onClick={() => setShowApplyModal(false)}>Cancel</button>
                    <button className="apply-modal-btn-primary" onClick={() => {
                      const f = applyForm;
                      if (!f.firstName.trim() || !f.lastName.trim() || !f.phone.trim() || !f.barangay.trim() || !f.purok.trim()) {
                        setApplyError('Please fill in all required fields.');
                        return;
                      }
                      setApplyError('');
                      setApplyStep(2);
                    }}>Next — Pick Schedule →</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} className="apply-step-view">
                  <div className="apply-steps-indicator">
                    <div className="apply-step-dot done"><span>✓</span> Personal Details</div>
                    <div className="apply-step-line done" />
                    <div className="apply-step-dot active"><span>2</span> Schedule</div>
                  </div>
                  {applyError && <div className="apply-error"><i className="fas fa-exclamation-circle" /> {applyError}</div>}
                  <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Choose a preferred date and time. Sundays and past dates are unavailable.</p>
                  <div className="apply-sched-grid">
                    <div>
                      <div className="apply-cal-nav">
                        <button type="button" onClick={() => {
                          if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
                          else setCalMonth(m => m - 1);
                        }}>‹</button>
                        <span>{MONTHS[calMonth]} {calYear}</span>
                        <button type="button" onClick={() => {
                          if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
                          else setCalMonth(m => m + 1);
                        }}>›</button>
                      </div>
                      <div className="apply-cal-grid">
                        {DAY_LABELS.map(d => <div key={d} className="apply-cal-hdr">{d}</div>)}
                        {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
                        {Array.from({ length: daysInMonth }, (_, i) => {
                          const d = i + 1;
                          const dt = new Date(calYear, calMonth, d);
                          const isPast = dt < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                          const isSun = dt.getDay() === 0;
                          const label = `${MONTHS[calMonth]} ${d}, ${calYear}`;
                          const isSelected = scheduleData.date === label;
                          const isToday = dt.toDateString() === today.toDateString();
                          let cls = 'apply-cal-day';
                          if (isPast || isSun) cls += ' disabled';
                          else if (isSelected) cls += ' selected';
                          else if (isToday) cls += ' today';
                          return <div key={d} className={cls} onClick={() => selectDate(d)}>{d}</div>;
                        })}
                      </div>
                    </div>
                    <div className="apply-slots">
                      <div className="apply-slot-label">☀️ Morning</div>
                      <div className="apply-slot-grid">
                        {MORNING_SLOTS.map(s => (
                          <button key={s} type="button" className={`apply-slot${scheduleData.slot === s ? ' selected' : ''}`} onClick={() => setScheduleData(sd => ({ ...sd, slot: s }))}>{s}</button>
                        ))}
                      </div>
                      <div className="apply-slot-label" style={{ marginTop: 12 }}>🌤 Afternoon</div>
                      <div className="apply-slot-grid">
                        {AFTERNOON_SLOTS.map(s => (
                          <button key={s} type="button" className={`apply-slot${scheduleData.slot === s ? ' selected' : ''}`} onClick={() => setScheduleData(sd => ({ ...sd, slot: s }))}>{s}</button>
                        ))}
                      </div>
                      {scheduleData.date && scheduleData.slot && (
                        <div className="apply-sched-summary">
                          <i className="fas fa-calendar-check" /> {scheduleData.date} · {scheduleData.slot}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="apply-modal-footer">
                    <button type="button" className="apply-modal-btn-secondary" onClick={() => { setApplyStep(1); setApplyError(''); }}>← Back</button>
                    <button type="submit" className="apply-modal-btn-primary" disabled={applyLoading}>
                      {applyLoading ? <><i className="fas fa-spinner fa-spin" /> Submitting...</> : <><i className="fas fa-paper-plane" /> Submit Application</>}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
