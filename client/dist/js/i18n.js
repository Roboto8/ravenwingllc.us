// === Internationalization (i18n) ===
// Supports 'en' (English) and 'es' (Spanish)

var I18N = {
  _lang: localStorage.getItem('fc_lang') || 'en',

  en: {
    // -- Nav --
    nav_brand: 'FenceTrace',
    nav_tagline: 'Estimate in 60 seconds',
    btn_new: 'New',
    btn_save: 'Save',
    btn_my_estimates: 'My Estimates',
    btn_account: 'Account',
    btn_logout: 'Log Out',
    btn_signin: 'Sign In',

    // -- Loading --
    loading_tagline: 'Satellite fence estimates',

    // -- Search --
    search_placeholder: 'Search address...',
    search_go: 'Go',

    // -- Map layers --
    layer_satellite: 'Satellite',
    layer_hybrid: 'Hybrid',
    layer_streets: 'Streets',
    layer_topo: 'Topo',
    layer_drone: 'Drone',

    // -- Map toolbar --
    tool_draw: 'Draw',
    tool_gate: 'Gate',
    tool_curve: 'Curve',
    tool_mulch: 'Mulch',
    tool_section: 'Section',
    tool_close: 'Close',
    tool_open: 'Open',
    tool_undo: 'Undo',
    tool_clear: 'Clear',
    footage_label: 'Total',
    footage_unit: 'ft',

    // -- Panel toggle (mobile) --
    panel_show_estimate: 'Show Estimate',

    // -- Panel sections --
    section_customer: 'Customer',
    section_region: 'Region',
    section_material: 'Material',
    section_height: 'Height',
    section_extras: 'Extras',
    section_ground: 'Ground',
    section_gates: 'Gates',
    section_bom: 'Material Breakdown',
    section_custom_items: 'Custom Items',
    section_estimate: 'Estimate',

    // -- Customer form --
    placeholder_name: 'Name',
    placeholder_phone: 'Phone',
    placeholder_address: 'Address',

    // -- Fence types --
    fence_wood: 'Wood',
    fence_vinyl: 'Vinyl',
    fence_chain_link: 'Chain Link',
    fence_aluminum: 'Aluminum',
    fence_iron: 'Iron',

    // -- Height buttons --
    height_custom: 'Custom',

    // -- Extras / addons --
    addon_removal: 'Remove old fence',
    addon_permit: 'Permit',
    addon_stain: 'Stain / seal',

    // -- Ground / terrain --
    terrain_flat: 'Flat',
    terrain_slope: 'Slope',
    terrain_rocky: 'Rocky',

    // -- Gates --
    gates_empty: 'Place gates by clicking the map',
    gate_label: 'Gate',
    gate_single: 'Single',
    gate_double: 'Double',
    gate_sliding: 'Sliding',

    // -- BOM --
    bom_empty: 'Draw fence to see materials',
    bom_materials_total: 'Materials Total',
    bom_edit_prices: 'Edit prices',

    // -- BOM item names --
    bom_posts: 'posts',
    bom_rails: 'rails',
    bom_pickets: 'pickets',
    bom_rail_brackets: 'Rail brackets',
    bom_post_caps: 'Post caps',
    bom_concrete_bags: '50lb concrete bags',
    bom_screw_boxes: 'Exterior deck screws (box)',
    bom_panels: 'panels',
    bom_stiffener: 'Aluminum post stiffener',
    bom_self_tap_screws: 'Self-tapping screws (box)',
    bom_line_posts: 'line posts',
    bom_terminal_posts: 'terminal posts',
    bom_top_rail: 'top rail',
    bom_mesh_rolls: 'mesh rolls',
    bom_tension_bars: 'Tension bars',
    bom_tension_bands: 'Tension bands',
    bom_brace_bands: 'Brace bands',
    bom_rail_end_cups: 'Rail end cups',
    bom_loop_caps: 'Loop caps (line)',
    bom_dome_caps: 'Dome caps (terminal)',
    bom_carriage_bolts: '5/16" carriage bolts',
    bom_tie_wires: 'Tie wires',
    bom_mounting_brackets: 'Mounting brackets',
    bom_ss_screws: 'SS self-tapping screws',
    bom_bolts_screws: 'Bolts/screws',

    // -- Custom items --
    custom_add_btn: 'Add labor, delivery, or other costs',
    custom_item_placeholder: 'Item name',
    custom_qty_placeholder: 'Qty',

    // -- Estimate summary --
    summary_fence: 'fence',
    summary_gates: 'Gates',
    summary_removal: 'Removal',
    summary_permit: 'Permit',
    summary_stain: 'Stain / seal',
    summary_terrain: 'Terrain',
    summary_custom: 'Custom items',
    summary_total: 'Total',
    estimate_disclaimer: 'Measurements are satellite-based estimates. Verify on-site before final bid.',

    // -- Panel actions --
    btn_share: 'Share Estimate',
    btn_pdf: 'Save as PDF',

    // -- Footer --
    footer_copy: '2026 RavenWing LLC',
    footer_terms: 'Terms',
    footer_privacy: 'Privacy',

    // -- Auth modal --
    auth_title: 'FenceTrace',
    auth_subtitle: '14-day free trial. No card required.',
    auth_login_btn: 'Log In',
    auth_signup_btn: 'Start Free Trial',
    auth_verify_btn: 'Verify',
    auth_no_account: 'No account?',
    auth_sign_up: 'Sign up',
    auth_have_account: 'Have an account?',
    auth_log_in: 'Log in',
    auth_check_email: 'Check your email for a verification code.',
    placeholder_email: 'Email',
    placeholder_password: 'Password',
    placeholder_password_hint: 'Password (10+ chars, upper, lower, number)',
    placeholder_company: 'Company name',
    hint_company_name: 'Shown on estimates and approvals your customers see',
    placeholder_verification: 'Verification code',
    auth_email_password_required: 'Email and password required',
    auth_company_required: 'Company name required',
    auth_enter_code: 'Enter the code',
    auth_verified: 'Verified! You can log in now.',

    // -- Trial / Paywall --
    trial_expired: 'Trial Expired',
    trial_subscribe_msg: 'Subscribe to keep creating estimates.',
    trial_subscribe_btn: 'Subscribe',
    trial_subscribe_price: 'Subscribe — $49/mo',
    trial_days_left: '{n} days left in trial',

    // -- Account modal --
    account_title: 'Account',
    account_email: 'Email',
    account_status: 'Status',
    account_next_billing: 'Next billing',
    account_plan: 'Plan',
    account_manage_sub: 'Manage Subscription',
    account_export: 'Export My Data',
    account_cancel_note: 'Cancel anytime — no fees, no questions. Your data stays available for 90 days after cancellation.',

    // -- Team --
    team_title: 'Team',
    team_loading: 'Loading...',
    team_invite_placeholder: 'Email address',
    team_invite_btn: 'Invite',

    // -- Roles --
    roles_title: 'Roles',
    roles_loading: 'Loading...',
    role_name_placeholder: 'Role name',
    role_save: 'Save Role',
    role_cancel: 'Cancel',
    role_new: '+ New Role',

    // -- Permissions --
    perm_create_estimates: 'Create estimates',
    perm_edit_estimates: 'Edit estimates',
    perm_delete_estimates: 'Delete estimates',
    perm_share_estimates: 'Share estimates',
    perm_export_pdf: 'Export PDF',
    perm_manage_team: 'Manage team',
    perm_manage_roles: 'Manage roles',
    perm_manage_pricing: 'Manage pricing',
    perm_manage_billing: 'Manage billing',

    // -- Role names --
    role_owner: 'Owner',
    role_admin: 'Admin',
    role_estimator: 'Estimator',
    role_viewer: 'Viewer',

    // -- Status labels --
    status_active: 'Active',
    status_trialing: 'Trial',
    status_expired: 'Expired',
    status_canceled: 'Canceled',
    status_past_due: 'Past Due',
    status_pending: 'Pending',

    // -- Pricing region --
    pricing_region_title: 'Pricing Region',
    pricing_region_desc: 'Adjusts default material prices for your area. You can override individual prices below.',
    pricebook_title: 'Price Book',
    pricebook_desc: 'Override any material price. Leave blank to use regional default.',
    pricebook_save: 'Save Prices',
    pricebook_reset: 'Reset to Defaults',

    // -- Pricing editor modal --
    pricing_edit_title: 'Edit Material Prices',
    pricing_edit_sub: 'Set your actual supplier costs',
    pricing_done: 'Done',

    // -- Keyboard shortcuts --
    shortcuts_title: 'Keyboard Shortcuts',
    shortcut_draw: 'Draw tool',
    shortcut_gate: 'Gate tool',
    shortcut_curve: 'Toggle curve mode',
    shortcut_section: 'New section',
    shortcut_close: 'Close / open loop',
    shortcut_undo: 'Undo (points & gates)',
    shortcut_clear: 'Clear all',
    shortcut_new_est: 'New estimate',
    shortcut_save: 'Save estimate',
    shortcut_my_est: 'My Estimates',
    shortcut_share: 'Share estimate',
    shortcut_pdf: 'Save as PDF',
    shortcut_cancel: 'Cancel / close',

    // -- Utility --
    btn_reset_tips: 'Reset Tips',
    btn_reset_onboarding: 'Reset Onboarding',

    // -- Estimates drawer --
    drawer_title: 'Saved Estimates',
    drawer_estimates_tab: 'Estimates',
    drawer_trash_tab: 'Trash',
    drawer_empty: 'No saved estimates yet',

    // -- Onboarding --
    onboard_step1_title: 'Search for a property address',
    onboard_step1_desc: 'Type an address into the search bar to fly to any property on the satellite map.',
    onboard_step2_title: 'Click the map to draw fence lines',
    onboard_step2_desc: 'Click points on the map to trace the fence. Each segment shows its length in feet.',
    onboard_step3_title: 'Review your estimate and share it',
    onboard_step3_desc: 'Pick materials, add extras, then share or save your estimate as a PDF.',
    onboard_next: 'Next',
    onboard_got_it: 'Got it',

    // -- Drone overlay --
    drone_title: 'Drone Photo Overlay',
    drone_desc: 'Drag the <b>orange corners</b> to align the photo with the property. Use the slider to adjust transparency.',
    drone_see_through: 'See-through',
    drone_got_it: 'Got it',
    drone_remove: 'Remove Photo',

    // -- Map empty state --
    empty_map: 'Search an address or tap the map to start',

    // -- Toast messages --
    toast_section_started: 'Section {n} started — click the map to draw',
    toast_section_removed: 'Section removed',
    toast_segment_set: 'Segment set to {n} ft',
    toast_zoom_closer: 'Zoom in closer for accurate placement',
    toast_zoom_tip: 'Tip: zoom to 18+ for best accuracy (~0.5 ft/pixel)',
    toast_link_copied: 'Link copied to clipboard',
    toast_addr_not_found: 'Address not found. Try being more specific.',
    toast_search_failed: 'Search failed. Check your connection.',
    toast_generating_pdf: 'Generating PDF...',
    toast_pdf_lib_error: 'PDF library not loaded. Try refreshing.',
    toast_pdf_downloaded: 'PDF downloaded',
    toast_pdf_error: 'PDF error: {msg}',
    toast_image_too_large: 'Image too large (max 50MB)',
    toast_drone_removed: 'Drone photo removed',
    toast_screenshot_disabled: 'Screenshots are disabled',
    toast_print_disabled: 'Printing is disabled. Use Save as PDF instead.',
    toast_gate_removed: 'Gate removed',
    toast_sections_diff_material: 'Sections use different materials ({a} vs {b}) — keeping separate',
    toast_sections_overlap: 'Sections overlap',
    toast_sections_joined: 'Sections joined',
    toast_merge_join: 'Join',
    toast_merge_ignore: 'Ignore',
    toast_tips_reset: 'Tips have been reset',
    toast_onboarding_reset: 'Onboarding has been reset. Reload to see it.',
    toast_region_set: 'Region: {name}',

    // -- Hints --
    hint_first_visit: 'Search an address or click the map to start',
    hint_first_point: 'Click to add more points. Each segment shows its length.',
    hint_three_points: 'Try the Close button to complete a perimeter',
    hint_first_gate: 'Change gate type in the panel on the right',
    hint_fence_type: 'You can edit material prices with the pencil icon',
    hint_fifty_feet: 'Click any measurement to type an exact length',
    hint_bom_appears: 'Quantities are editable \u2014 adjust any count',
    hint_first_estimate: 'Share or save as PDF at the bottom of the panel',
    hint_got_it: 'Got it',

    // -- PDF strings --
    pdf_title: 'FenceTrace',
    pdf_subtitle: 'Satellite-powered fence estimates',
    pdf_estimate_num: 'Estimate #',
    pdf_prepared_for: 'Prepared for',
    pdf_customer: 'Customer',
    pdf_project_summary: 'Project Summary',
    pdf_fence_type: 'Fence Type',
    pdf_height: 'Height',
    pdf_total_footage: 'Total Linear Footage',
    pdf_terrain: 'Terrain',
    pdf_material_breakdown: 'Material Breakdown',
    pdf_item: 'Item',
    pdf_qty: 'Qty',
    pdf_unit_cost: 'Unit Cost',
    pdf_total: 'Total',
    pdf_materials_total: 'Materials Total',
    pdf_additional_items: 'Additional Items',
    pdf_estimate_summary: 'Estimate Summary',
    pdf_total_estimate: 'Total Estimate',
    pdf_valid_30_days: 'This estimate is valid for 30 days. Actual costs may vary based on site conditions.',
    pdf_generated_by: 'Generated by FenceTrace',
    pdf_fence_layout: 'Fence Layout',
    pdf_linear_ft: 'linear ft',
    pdf_curved: 'curved',
    pdf_flat: 'Flat',
    pdf_slope: 'Slope (+15%)',
    pdf_rocky: 'Rocky (+30%)',
    pdf_old_fence_removal: 'Old fence removal',
    pdf_permit_fee: 'Permit fee',
    pdf_stain_seal: 'Stain / seal',
    pdf_terrain_adjustment: 'Terrain adjustment',
    pdf_custom_items: 'Custom items',

    // -- Zoom accuracy --
    accuracy_excellent: 'Excellent',
    accuracy_good: 'Good',
    accuracy_fair: 'Fair',
    accuracy_low: 'Low',

    // -- Misc --
    gate_marker_label: 'GATE',
    remove_segment_title: 'Remove segment',
    tap_to_edit_price: 'Tap to edit price',
    add_section_title: 'Add section'
  },

  es: {
    // -- Nav --
    nav_brand: 'FenceTrace',
    nav_tagline: 'Estimacion en 60 segundos',
    btn_new: 'Nuevo',
    btn_save: 'Guardar',
    btn_my_estimates: 'Mis Estimaciones',
    btn_account: 'Cuenta',
    btn_logout: 'Cerrar Sesion',
    btn_signin: 'Iniciar Sesion',

    // -- Loading --
    loading_tagline: 'Estimaciones de cercas por satelite',

    // -- Search --
    search_placeholder: 'Buscar direccion...',
    search_go: 'Ir',

    // -- Map layers --
    layer_satellite: 'Satelite',
    layer_hybrid: 'Hibrido',
    layer_streets: 'Calles',
    layer_topo: 'Topo',
    layer_drone: 'Dron',

    // -- Map toolbar --
    tool_draw: 'Dibujar',
    tool_gate: 'Puerta',
    tool_curve: 'Curva',
    tool_mulch: 'Mantillo',
    tool_section: 'Seccion',
    tool_close: 'Cerrar',
    tool_open: 'Abrir',
    tool_undo: 'Deshacer',
    tool_clear: 'Limpiar',
    footage_label: 'Total',
    footage_unit: 'pies',

    // -- Panel toggle (mobile) --
    panel_show_estimate: 'Ver Estimacion',

    // -- Panel sections --
    section_customer: 'Cliente',
    section_region: 'Region',
    section_material: 'Material',
    section_height: 'Altura',
    section_extras: 'Extras',
    section_ground: 'Terreno',
    section_gates: 'Puertas',
    section_bom: 'Desglose de Materiales',
    section_custom_items: 'Items Personalizados',
    section_estimate: 'Estimacion',

    // -- Customer form --
    placeholder_name: 'Nombre',
    placeholder_phone: 'Telefono',
    placeholder_address: 'Direccion',

    // -- Fence types --
    fence_wood: 'Madera',
    fence_vinyl: 'Vinilo',
    fence_chain_link: 'Malla Ciclonica',
    fence_aluminum: 'Aluminio',
    fence_iron: 'Hierro',

    // -- Height buttons --
    height_custom: 'Otro',

    // -- Extras / addons --
    addon_removal: 'Retirar cerca vieja',
    addon_permit: 'Permiso',
    addon_stain: 'Tinte / sellador',

    // -- Ground / terrain --
    terrain_flat: 'Plano',
    terrain_slope: 'Pendiente',
    terrain_rocky: 'Rocoso',

    // -- Gates --
    gates_empty: 'Coloque puertas haciendo clic en el mapa',
    gate_label: 'Puerta',
    gate_single: 'Simple',
    gate_double: 'Doble',
    gate_sliding: 'Corrediza',

    // -- BOM --
    bom_empty: 'Dibuje la cerca para ver materiales',
    bom_materials_total: 'Total de Materiales',
    bom_edit_prices: 'Editar precios',

    // -- BOM item names --
    bom_posts: 'postes',
    bom_rails: 'rieles',
    bom_pickets: 'tablas',
    bom_rail_brackets: 'Soportes de riel',
    bom_post_caps: 'Tapas de poste',
    bom_concrete_bags: 'Bolsas de concreto 50lb',
    bom_screw_boxes: 'Tornillos exteriores (caja)',
    bom_panels: 'paneles',
    bom_stiffener: 'Refuerzo de aluminio para poste',
    bom_self_tap_screws: 'Tornillos autoperforantes (caja)',
    bom_line_posts: 'postes de linea',
    bom_terminal_posts: 'postes terminales',
    bom_top_rail: 'riel superior',
    bom_mesh_rolls: 'rollos de malla',
    bom_tension_bars: 'Barras de tension',
    bom_tension_bands: 'Bandas de tension',
    bom_brace_bands: 'Bandas de refuerzo',
    bom_rail_end_cups: 'Copas de extremo de riel',
    bom_loop_caps: 'Tapas de bucle (linea)',
    bom_dome_caps: 'Tapas de domo (terminal)',
    bom_carriage_bolts: 'Pernos de coche 5/16"',
    bom_tie_wires: 'Alambres de amarre',
    bom_mounting_brackets: 'Soportes de montaje',
    bom_ss_screws: 'Tornillos SS autoperforantes',
    bom_bolts_screws: 'Pernos/tornillos',

    // -- Custom items --
    custom_add_btn: 'Agregar mano de obra, envio u otros costos',
    custom_item_placeholder: 'Nombre del item',
    custom_qty_placeholder: 'Cant',

    // -- Estimate summary --
    summary_fence: 'cerca',
    summary_gates: 'Puertas',
    summary_removal: 'Retiro',
    summary_permit: 'Permiso',
    summary_stain: 'Tinte / sellador',
    summary_terrain: 'Terreno',
    summary_custom: 'Items personalizados',
    summary_total: 'Total',
    estimate_disclaimer: 'Las medidas son estimaciones satelitales. Verifique en el sitio antes de la oferta final.',

    // -- Panel actions --
    btn_share: 'Compartir Estimacion',
    btn_pdf: 'Guardar como PDF',

    // -- Footer --
    footer_copy: '2026 RavenWing LLC',
    footer_terms: 'Terminos',
    footer_privacy: 'Privacidad',

    // -- Auth modal --
    auth_title: 'FenceTrace',
    auth_subtitle: 'Prueba gratis de 14 dias. Sin tarjeta.',
    auth_login_btn: 'Iniciar Sesion',
    auth_signup_btn: 'Comenzar Prueba Gratis',
    auth_verify_btn: 'Verificar',
    auth_no_account: 'Sin cuenta?',
    auth_sign_up: 'Registrate',
    auth_have_account: 'Tienes cuenta?',
    auth_log_in: 'Inicia sesion',
    auth_check_email: 'Revisa tu correo para el codigo de verificacion.',
    placeholder_email: 'Correo electronico',
    placeholder_password: 'Contrasena',
    placeholder_password_hint: 'Contrasena (10+ caracteres, mayuscula, minuscula, numero)',
    placeholder_company: 'Nombre de la empresa',
    hint_company_name: 'Se muestra en presupuestos y aprobaciones que ven sus clientes',
    placeholder_verification: 'Codigo de verificacion',
    auth_email_password_required: 'Correo y contrasena requeridos',
    auth_company_required: 'Nombre de empresa requerido',
    auth_enter_code: 'Ingresa el codigo',
    auth_verified: 'Verificado! Ya puedes iniciar sesion.',

    // -- Trial / Paywall --
    trial_expired: 'Prueba Expirada',
    trial_subscribe_msg: 'Suscribete para seguir creando estimaciones.',
    trial_subscribe_btn: 'Suscribirse',
    trial_subscribe_price: 'Suscribirse — $49/mes',
    trial_days_left: '{n} dias restantes de prueba',

    // -- Account modal --
    account_title: 'Cuenta',
    account_email: 'Correo',
    account_status: 'Estado',
    account_next_billing: 'Proxima facturacion',
    account_plan: 'Plan',
    account_manage_sub: 'Administrar Suscripcion',
    account_export: 'Exportar Mis Datos',
    account_cancel_note: 'Cancela cuando quieras — sin cargos, sin preguntas. Tus datos estaran disponibles por 90 dias despues de cancelar.',

    // -- Team --
    team_title: 'Equipo',
    team_loading: 'Cargando...',
    team_invite_placeholder: 'Correo electronico',
    team_invite_btn: 'Invitar',

    // -- Roles --
    roles_title: 'Roles',
    roles_loading: 'Cargando...',
    role_name_placeholder: 'Nombre del rol',
    role_save: 'Guardar Rol',
    role_cancel: 'Cancelar',
    role_new: '+ Nuevo Rol',

    // -- Permissions --
    perm_create_estimates: 'Crear estimaciones',
    perm_edit_estimates: 'Editar estimaciones',
    perm_delete_estimates: 'Eliminar estimaciones',
    perm_share_estimates: 'Compartir estimaciones',
    perm_export_pdf: 'Exportar PDF',
    perm_manage_team: 'Administrar equipo',
    perm_manage_roles: 'Administrar roles',
    perm_manage_pricing: 'Administrar precios',
    perm_manage_billing: 'Administrar facturacion',

    // -- Role names --
    role_owner: 'Propietario',
    role_admin: 'Administrador',
    role_estimator: 'Estimador',
    role_viewer: 'Observador',

    // -- Status labels --
    status_active: 'Activo',
    status_trialing: 'Prueba',
    status_expired: 'Expirado',
    status_canceled: 'Cancelado',
    status_past_due: 'Pago Vencido',
    status_pending: 'Pendiente',

    // -- Pricing region --
    pricing_region_title: 'Region de Precios',
    pricing_region_desc: 'Ajusta los precios de materiales predeterminados para tu area. Puedes modificar precios individuales abajo.',
    pricebook_title: 'Libro de Precios',
    pricebook_desc: 'Modifica cualquier precio de material. Deja en blanco para usar el predeterminado regional.',
    pricebook_save: 'Guardar Precios',
    pricebook_reset: 'Restaurar Valores',

    // -- Pricing editor modal --
    pricing_edit_title: 'Editar Precios de Materiales',
    pricing_edit_sub: 'Ingresa tus costos reales de proveedor',
    pricing_done: 'Listo',

    // -- Keyboard shortcuts --
    shortcuts_title: 'Atajos de Teclado',
    shortcut_draw: 'Herramienta dibujar',
    shortcut_gate: 'Herramienta puerta',
    shortcut_curve: 'Modo curva',
    shortcut_section: 'Nueva seccion',
    shortcut_close: 'Cerrar / abrir bucle',
    shortcut_undo: 'Deshacer (puntos y puertas)',
    shortcut_clear: 'Limpiar todo',
    shortcut_new_est: 'Nueva estimacion',
    shortcut_save: 'Guardar estimacion',
    shortcut_my_est: 'Mis Estimaciones',
    shortcut_share: 'Compartir estimacion',
    shortcut_pdf: 'Guardar como PDF',
    shortcut_cancel: 'Cancelar / cerrar',

    // -- Utility --
    btn_reset_tips: 'Reiniciar Consejos',
    btn_reset_onboarding: 'Reiniciar Tutorial',

    // -- Estimates drawer --
    drawer_title: 'Estimaciones Guardadas',
    drawer_estimates_tab: 'Estimaciones',
    drawer_trash_tab: 'Papelera',
    drawer_empty: 'No hay estimaciones guardadas',

    // -- Onboarding --
    onboard_step1_title: 'Busca la direccion de la propiedad',
    onboard_step1_desc: 'Escribe una direccion en la barra de busqueda para volar a cualquier propiedad en el mapa satelital.',
    onboard_step2_title: 'Haz clic en el mapa para dibujar la cerca',
    onboard_step2_desc: 'Haz clic en puntos del mapa para trazar la cerca. Cada segmento muestra su longitud en pies.',
    onboard_step3_title: 'Revisa tu estimacion y compartela',
    onboard_step3_desc: 'Elige materiales, agrega extras, luego comparte o guarda tu estimacion como PDF.',
    onboard_next: 'Siguiente',
    onboard_got_it: 'Entendido',

    // -- Drone overlay --
    drone_title: 'Superposicion de Foto de Dron',
    drone_desc: 'Arrastra las <b>esquinas naranjas</b> para alinear la foto con la propiedad. Usa el control para ajustar la transparencia.',
    drone_see_through: 'Transparencia',
    drone_got_it: 'Entendido',
    drone_remove: 'Quitar Foto',

    // -- Map empty state --
    empty_map: 'Busca una direccion o toca el mapa para comenzar',

    // -- Toast messages --
    toast_section_started: 'Seccion {n} iniciada — haz clic en el mapa para dibujar',
    toast_section_removed: 'Seccion eliminada',
    toast_segment_set: 'Segmento ajustado a {n} pies',
    toast_zoom_closer: 'Acerca mas el mapa para mayor precision',
    toast_zoom_tip: 'Consejo: zoom 18+ para mejor precision (~0.5 pies/pixel)',
    toast_link_copied: 'Enlace copiado al portapapeles',
    toast_addr_not_found: 'Direccion no encontrada. Intenta ser mas especifico.',
    toast_search_failed: 'Busqueda fallida. Verifica tu conexion.',
    toast_generating_pdf: 'Generando PDF...',
    toast_pdf_lib_error: 'Biblioteca PDF no cargada. Intenta recargar.',
    toast_pdf_downloaded: 'PDF descargado',
    toast_pdf_error: 'Error de PDF: {msg}',
    toast_image_too_large: 'Imagen muy grande (max 50MB)',
    toast_drone_removed: 'Foto de dron eliminada',
    toast_screenshot_disabled: 'Capturas de pantalla deshabilitadas',
    toast_print_disabled: 'Impresion deshabilitada. Usa Guardar como PDF.',
    toast_gate_removed: 'Puerta eliminada',
    toast_sections_diff_material: 'Secciones usan materiales diferentes ({a} vs {b}) — se mantienen separadas',
    toast_sections_overlap: 'Las secciones se superponen',
    toast_sections_joined: 'Secciones unidas',
    toast_merge_join: 'Unir',
    toast_merge_ignore: 'Ignorar',
    toast_tips_reset: 'Consejos reiniciados',
    toast_onboarding_reset: 'Tutorial reiniciado. Recarga para verlo.',
    toast_region_set: 'Region: {name}',

    // -- Hints --
    hint_first_visit: 'Busca una direccion o haz clic en el mapa para comenzar',
    hint_first_point: 'Haz clic para agregar mas puntos. Cada segmento muestra su longitud.',
    hint_three_points: 'Prueba el boton Cerrar para completar un perimetro',
    hint_first_gate: 'Cambia el tipo de puerta en el panel de la derecha',
    hint_fence_type: 'Puedes editar los precios de materiales con el icono de lapiz',
    hint_fifty_feet: 'Haz clic en cualquier medida para escribir una longitud exacta',
    hint_bom_appears: 'Las cantidades son editables \u2014 ajusta cualquier cantidad',
    hint_first_estimate: 'Comparte o guarda como PDF en la parte inferior del panel',
    hint_got_it: 'Entendido',

    // -- PDF strings --
    pdf_title: 'FenceTrace',
    pdf_subtitle: 'Estimaciones de cercas por satelite',
    pdf_estimate_num: 'Estimacion #',
    pdf_prepared_for: 'Preparado para',
    pdf_customer: 'Cliente',
    pdf_project_summary: 'Resumen del Proyecto',
    pdf_fence_type: 'Tipo de Cerca',
    pdf_height: 'Altura',
    pdf_total_footage: 'Longitud Lineal Total',
    pdf_terrain: 'Terreno',
    pdf_material_breakdown: 'Desglose de Materiales',
    pdf_item: 'Articulo',
    pdf_qty: 'Cant',
    pdf_unit_cost: 'Costo Unit.',
    pdf_total: 'Total',
    pdf_materials_total: 'Total de Materiales',
    pdf_additional_items: 'Articulos Adicionales',
    pdf_estimate_summary: 'Resumen de Estimacion',
    pdf_total_estimate: 'Estimacion Total',
    pdf_valid_30_days: 'Esta estimacion es valida por 30 dias. Los costos reales pueden variar segun las condiciones del sitio.',
    pdf_generated_by: 'Generado por FenceTrace',
    pdf_fence_layout: 'Diseno de Cerca',
    pdf_linear_ft: 'pies lineales',
    pdf_curved: 'curvada',
    pdf_flat: 'Plano',
    pdf_slope: 'Pendiente (+15%)',
    pdf_rocky: 'Rocoso (+30%)',
    pdf_old_fence_removal: 'Retiro de cerca vieja',
    pdf_permit_fee: 'Tarifa de permiso',
    pdf_stain_seal: 'Tinte / sellador',
    pdf_terrain_adjustment: 'Ajuste de terreno',
    pdf_custom_items: 'Items personalizados',

    // -- Zoom accuracy --
    accuracy_excellent: 'Excelente',
    accuracy_good: 'Buena',
    accuracy_fair: 'Regular',
    accuracy_low: 'Baja',

    // -- Misc --
    gate_marker_label: 'PUERTA',
    remove_segment_title: 'Eliminar segmento',
    tap_to_edit_price: 'Toca para editar precio',
    add_section_title: 'Agregar seccion'
  }
};

// Get current language
function getLang() {
  return I18N._lang;
}

// Set language and persist
function setLang(lang) {
  if (!I18N[lang]) return;
  I18N._lang = lang;
  localStorage.setItem('fc_lang', lang);
  document.documentElement.lang = lang;
  applyTranslations();
}

// Translate a key, with optional replacements: t('key', {n: 5})
function t(key, replacements) {
  var lang = I18N._lang;
  var str = (I18N[lang] && I18N[lang][key]) || (I18N.en && I18N.en[key]) || key;
  if (replacements) {
    Object.keys(replacements).forEach(function(k) {
      str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), replacements[k]);
    });
  }
  return str;
}

// Apply translations to all elements with data-i18n attribute
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    var attr = el.getAttribute('data-i18n-attr');
    if (attr === 'placeholder') {
      el.placeholder = t(key);
    } else if (attr === 'title') {
      el.title = t(key);
    } else if (attr === 'innerHTML') {
      el.innerHTML = t(key);
    } else {
      el.textContent = t(key);
    }
  });
}

// Initialize on load
(function() {
  document.documentElement.lang = I18N._lang;
})();
