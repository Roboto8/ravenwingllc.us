// === Internationalization (i18n) ===
// Supports 'en' (English), 'es' (Spanish), 'nl' (Dutch), 'fr' (French), 'de' (German), 'pt' (Portuguese)

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
    tool_draw: 'Fence',
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
    section_mulch: 'Mulch',
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
    auth_forgot_password: 'Forgot password?',
    auth_forgot_info: "Enter your email and we'll send a reset code.",
    auth_send_code_btn: 'Send Reset Code',
    auth_back_to_login: 'Back to login',
    auth_reset_info: 'Enter the code from your email and your new password.',
    auth_reset_btn: 'Reset Password',
    placeholder_reset_code: 'Reset code',
    placeholder_new_password: 'New password (10+ chars)',
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
    shortcut_draw: 'Fence tool',
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
    hint_mulch_tool: 'Drag to draw a rectangle, or hold Shift and click corners for custom shapes',
    hint_first_mulch: 'Drag the white handles to resize. Use the orange handle to rotate.',
    hint_shapes_picker: 'Try a preset shape \u2014 tap the map to place it, then resize',
    hint_delete_mode: 'Tap any fence, mulch bed, or gate to select it for deletion',
    hint_curve_mode: 'Curve smooths your fence lines. Toggle it off for straight segments.',
    hint_new_section: 'Sections let you use different fence types and heights on the same property',
    hint_save_estimate: 'Save your estimate to come back to it later or share with your customer',
    hint_share_flow: 'Send your customer a link \u2014 they can review and approve the estimate online',
    hint_mobile_zoom: 'Pinch to zoom in for more precise placement',
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
    tool_draw: 'Cerca',
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
    section_mulch: 'Mantillo',
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
    auth_forgot_password: 'Olvidaste tu contrasena?',
    auth_forgot_info: 'Ingresa tu correo y te enviaremos un codigo de restablecimiento.',
    auth_send_code_btn: 'Enviar Codigo',
    auth_back_to_login: 'Volver al inicio de sesion',
    auth_reset_info: 'Ingresa el codigo de tu correo y tu nueva contrasena.',
    auth_reset_btn: 'Restablecer Contrasena',
    placeholder_reset_code: 'Codigo de restablecimiento',
    placeholder_new_password: 'Nueva contrasena (10+ caracteres)',
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
    shortcut_draw: 'Herramienta cerca',
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
    hint_mulch_tool: 'Arrastra para dibujar un rectangulo, o manten Shift y haz clic para formas personalizadas',
    hint_first_mulch: 'Arrastra los puntos blancos para redimensionar. Usa el punto naranja para rotar.',
    hint_shapes_picker: 'Prueba una forma predefinida \u2014 toca el mapa para colocarla y luego redimensiona',
    hint_delete_mode: 'Toca cualquier cerca, cama de mantillo o puerta para seleccionarla y eliminarla',
    hint_curve_mode: 'Curva suaviza las lineas de la cerca. Desactivala para segmentos rectos.',
    hint_new_section: 'Las secciones permiten usar diferentes tipos y alturas de cerca en la misma propiedad',
    hint_save_estimate: 'Guarda tu presupuesto para volver a el mas tarde o compartirlo con tu cliente',
    hint_share_flow: 'Envia a tu cliente un enlace \u2014 puede revisar y aprobar el presupuesto en linea',
    hint_mobile_zoom: 'Pellizca para acercar y colocar con mas precision',
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
  },

  nl: {
    // -- Nav --
    nav_brand: 'FenceTrace',
    nav_tagline: 'Offerte in 60 seconden',
    btn_new: 'Nieuw',
    btn_save: 'Opslaan',
    btn_my_estimates: 'Mijn Offertes',
    btn_account: 'Account',
    btn_logout: 'Uitloggen',
    btn_signin: 'Inloggen',

    // -- Loading --
    loading_tagline: 'Satelliet hekwerk offertes',

    // -- Search --
    search_placeholder: 'Adres zoeken...',
    search_go: 'Ga',

    // -- Map layers --
    layer_satellite: 'Satelliet',
    layer_hybrid: 'Hybride',
    layer_streets: 'Straten',
    layer_topo: 'Topo',
    layer_drone: 'Drone',

    // -- Map toolbar --
    tool_draw: 'Hek',
    tool_gate: 'Poort',
    tool_curve: 'Bocht',
    tool_mulch: 'Mulch',
    tool_section: 'Sectie',
    tool_close: 'Sluiten',
    tool_open: 'Openen',
    tool_undo: 'Ongedaan',
    tool_clear: 'Wissen',
    footage_label: 'Totaal',
    footage_unit: 'ft',

    // -- Panel toggle (mobile) --
    panel_show_estimate: 'Toon Offerte',

    // -- Panel sections --
    section_customer: 'Klant',
    section_region: 'Regio',
    section_material: 'Materiaal',
    section_height: 'Hoogte',
    section_extras: 'Extra\'s',
    section_ground: 'Ondergrond',
    section_gates: 'Poorten',
    section_bom: 'Materiaaloverzicht',
    section_custom_items: 'Aangepaste Items',
    section_mulch: 'Mulch',
    section_estimate: 'Offerte',

    // -- Customer form --
    placeholder_name: 'Naam',
    placeholder_phone: 'Telefoon',
    placeholder_address: 'Adres',

    // -- Fence types --
    fence_wood: 'Hout',
    fence_vinyl: 'Vinyl',
    fence_chain_link: 'Gaas',
    fence_aluminum: 'Aluminium',
    fence_iron: 'IJzer',

    // -- Height buttons --
    height_custom: 'Aangepast',

    // -- Extras / addons --
    addon_removal: 'Oud hekwerk verwijderen',
    addon_permit: 'Vergunning',
    addon_stain: 'Beits / lak',

    // -- Ground / terrain --
    terrain_flat: 'Vlak',
    terrain_slope: 'Helling',
    terrain_rocky: 'Rotsachtig',

    // -- Gates --
    gates_empty: 'Plaats poorten door op de kaart te klikken',
    gate_label: 'Poort',
    gate_single: 'Enkel',
    gate_double: 'Dubbel',
    gate_sliding: 'Schuif',

    // -- BOM --
    bom_empty: 'Teken hekwerk om materialen te zien',
    bom_materials_total: 'Materialen Totaal',
    bom_edit_prices: 'Prijzen bewerken',

    // -- BOM item names --
    bom_posts: 'palen',
    bom_rails: 'regels',
    bom_pickets: 'latten',
    bom_rail_brackets: 'Regelbeugels',
    bom_post_caps: 'Paalkappen',
    bom_concrete_bags: 'Betonzakken (25kg)',
    bom_screw_boxes: 'Buitenschroeven (doos)',
    bom_panels: 'panelen',
    bom_stiffener: 'Aluminium paalversteviging',
    bom_self_tap_screws: 'Zelftappende schroeven (doos)',
    bom_line_posts: 'tussenpalen',
    bom_terminal_posts: 'eindpalen',
    bom_top_rail: 'bovenregel',
    bom_mesh_rolls: 'gaasrollen',
    bom_tension_bars: 'Spanstaven',
    bom_tension_bands: 'Spanbanden',
    bom_brace_bands: 'Steunbanden',
    bom_rail_end_cups: 'Regeleindkappen',
    bom_loop_caps: 'Luskappen (lijn)',
    bom_dome_caps: 'Bolkappen (eind)',
    bom_carriage_bolts: 'Slotbouten 8mm',
    bom_tie_wires: 'Binddraden',
    bom_mounting_brackets: 'Montagebeugels',
    bom_ss_screws: 'RVS zelftappende schroeven',
    bom_bolts_screws: 'Bouten/schroeven',

    // -- Custom items --
    custom_add_btn: 'Arbeid, levering of andere kosten toevoegen',
    custom_item_placeholder: 'Itemnaam',
    custom_qty_placeholder: 'Aantal',

    // -- Estimate summary --
    summary_fence: 'hekwerk',
    summary_gates: 'Poorten',
    summary_removal: 'Verwijdering',
    summary_permit: 'Vergunning',
    summary_stain: 'Beits / lak',
    summary_terrain: 'Terrein',
    summary_custom: 'Aangepaste items',
    summary_total: 'Totaal',
    estimate_disclaimer: 'Metingen zijn satellietschattingen. Controleer ter plaatse voor definitieve offerte.',

    // -- Panel actions --
    btn_share: 'Offerte Delen',
    btn_pdf: 'Opslaan als PDF',

    // -- Footer --
    footer_copy: '2026 RavenWing LLC',
    footer_terms: 'Voorwaarden',
    footer_privacy: 'Privacy',

    // -- Auth modal --
    auth_title: 'FenceTrace',
    auth_subtitle: '14 dagen gratis proberen. Geen kaart nodig.',
    auth_login_btn: 'Inloggen',
    auth_signup_btn: 'Gratis Proberen',
    auth_verify_btn: 'Verifieren',
    auth_no_account: 'Geen account?',
    auth_sign_up: 'Registreren',
    auth_have_account: 'Heb je een account?',
    auth_log_in: 'Inloggen',
    auth_check_email: 'Controleer je e-mail voor een verificatiecode.',
    auth_forgot_password: 'Wachtwoord vergeten?',
    auth_forgot_info: 'Voer je e-mail in en we sturen een herstelcode.',
    auth_send_code_btn: 'Herstelcode Versturen',
    auth_back_to_login: 'Terug naar inloggen',
    auth_reset_info: 'Voer de code uit je e-mail en je nieuwe wachtwoord in.',
    auth_reset_btn: 'Wachtwoord Herstellen',
    placeholder_reset_code: 'Herstelcode',
    placeholder_new_password: 'Nieuw wachtwoord (10+ tekens)',
    placeholder_email: 'E-mail',
    placeholder_password: 'Wachtwoord',
    placeholder_password_hint: 'Wachtwoord (10+ tekens, hoofd-, kleine letter, cijfer)',
    placeholder_company: 'Bedrijfsnaam',
    hint_company_name: 'Wordt getoond op offertes en goedkeuringen die uw klanten zien',
    placeholder_verification: 'Verificatiecode',
    auth_email_password_required: 'E-mail en wachtwoord vereist',
    auth_company_required: 'Bedrijfsnaam vereist',
    auth_enter_code: 'Voer de code in',
    auth_verified: 'Geverifieerd! Je kunt nu inloggen.',

    // -- Trial / Paywall --
    trial_expired: 'Proefperiode Verlopen',
    trial_subscribe_msg: 'Abonneer om offertes te blijven maken.',
    trial_subscribe_btn: 'Abonneren',
    trial_subscribe_price: 'Abonneren — $49/mnd',
    trial_days_left: '{n} dagen proefperiode over',

    // -- Account modal --
    account_title: 'Account',
    account_email: 'E-mail',
    account_status: 'Status',
    account_next_billing: 'Volgende facturering',
    account_plan: 'Plan',
    account_manage_sub: 'Abonnement Beheren',
    account_export: 'Mijn Data Exporteren',
    account_cancel_note: 'Annuleer wanneer je wilt — geen kosten, geen vragen. Je data blijft 90 dagen beschikbaar na annulering.',

    // -- Team --
    team_title: 'Team',
    team_loading: 'Laden...',
    team_invite_placeholder: 'E-mailadres',
    team_invite_btn: 'Uitnodigen',

    // -- Roles --
    roles_title: 'Rollen',
    roles_loading: 'Laden...',
    role_name_placeholder: 'Rolnaam',
    role_save: 'Rol Opslaan',
    role_cancel: 'Annuleren',
    role_new: '+ Nieuwe Rol',

    // -- Permissions --
    perm_create_estimates: 'Offertes maken',
    perm_edit_estimates: 'Offertes bewerken',
    perm_delete_estimates: 'Offertes verwijderen',
    perm_share_estimates: 'Offertes delen',
    perm_export_pdf: 'PDF exporteren',
    perm_manage_team: 'Team beheren',
    perm_manage_roles: 'Rollen beheren',
    perm_manage_pricing: 'Prijzen beheren',
    perm_manage_billing: 'Facturering beheren',

    // -- Role names --
    role_owner: 'Eigenaar',
    role_admin: 'Beheerder',
    role_estimator: 'Calculator',
    role_viewer: 'Kijker',

    // -- Status labels --
    status_active: 'Actief',
    status_trialing: 'Proef',
    status_expired: 'Verlopen',
    status_canceled: 'Geannuleerd',
    status_past_due: 'Achterstallig',
    status_pending: 'In Afwachting',

    // -- Pricing region --
    pricing_region_title: 'Prijsregio',
    pricing_region_desc: 'Past standaard materiaalprijzen aan voor uw regio. U kunt individuele prijzen hieronder aanpassen.',
    pricebook_title: 'Prijslijst',
    pricebook_desc: 'Overschrijf elke materiaalprijs. Laat leeg voor regionaal standaard.',
    pricebook_save: 'Prijzen Opslaan',
    pricebook_reset: 'Standaard Herstellen',

    // -- Pricing editor modal --
    pricing_edit_title: 'Materiaalprijzen Bewerken',
    pricing_edit_sub: 'Stel uw werkelijke leveranciersprijzen in',
    pricing_done: 'Klaar',

    // -- Keyboard shortcuts --
    shortcuts_title: 'Sneltoetsen',
    shortcut_draw: 'Hek tool',
    shortcut_gate: 'Poorttool',
    shortcut_curve: 'Bochtmodus',
    shortcut_section: 'Nieuwe sectie',
    shortcut_close: 'Sluiten / openen lus',
    shortcut_undo: 'Ongedaan maken (punten & poorten)',
    shortcut_clear: 'Alles wissen',
    shortcut_new_est: 'Nieuwe offerte',
    shortcut_save: 'Offerte opslaan',
    shortcut_my_est: 'Mijn Offertes',
    shortcut_share: 'Offerte delen',
    shortcut_pdf: 'Opslaan als PDF',
    shortcut_cancel: 'Annuleren / sluiten',

    // -- Utility --
    btn_reset_tips: 'Tips Resetten',
    btn_reset_onboarding: 'Rondleiding Resetten',

    // -- Estimates drawer --
    drawer_title: 'Opgeslagen Offertes',
    drawer_estimates_tab: 'Offertes',
    drawer_trash_tab: 'Prullenbak',
    drawer_empty: 'Nog geen opgeslagen offertes',

    // -- Onboarding --
    onboard_step1_title: 'Zoek een adres',
    onboard_step1_desc: 'Typ een adres in de zoekbalk om naar een eigendom op de satellietkaart te vliegen.',
    onboard_step2_title: 'Klik op de kaart om heklijnen te tekenen',
    onboard_step2_desc: 'Klik punten op de kaart om het hekwerk te traceren. Elk segment toont zijn lengte.',
    onboard_step3_title: 'Bekijk je offerte en deel deze',
    onboard_step3_desc: 'Kies materialen, voeg extra\'s toe, deel of sla je offerte op als PDF.',
    onboard_next: 'Volgende',
    onboard_got_it: 'Begrepen',

    // -- Drone overlay --
    drone_title: 'Drone Foto Overlay',
    drone_desc: 'Sleep de <b>oranje hoeken</b> om de foto uit te lijnen met het eigendom. Gebruik de schuifregelaar om transparantie aan te passen.',
    drone_see_through: 'Doorschijnend',
    drone_got_it: 'Begrepen',
    drone_remove: 'Foto Verwijderen',

    // -- Map empty state --
    empty_map: 'Zoek een adres of tik op de kaart om te beginnen',

    // -- Toast messages --
    toast_section_started: 'Sectie {n} gestart — klik op de kaart om te tekenen',
    toast_section_removed: 'Sectie verwijderd',
    toast_segment_set: 'Segment ingesteld op {n} ft',
    toast_zoom_closer: 'Zoom dichter in voor nauwkeurige plaatsing',
    toast_zoom_tip: 'Tip: zoom naar 18+ voor beste nauwkeurigheid (~0,5 ft/pixel)',
    toast_link_copied: 'Link gekopieerd naar klembord',
    toast_addr_not_found: 'Adres niet gevonden. Probeer specifieker te zijn.',
    toast_search_failed: 'Zoeken mislukt. Controleer je verbinding.',
    toast_generating_pdf: 'PDF genereren...',
    toast_pdf_lib_error: 'PDF-bibliotheek niet geladen. Probeer te vernieuwen.',
    toast_pdf_downloaded: 'PDF gedownload',
    toast_pdf_error: 'PDF-fout: {msg}',
    toast_image_too_large: 'Afbeelding te groot (max 50MB)',
    toast_drone_removed: 'Drone foto verwijderd',
    toast_screenshot_disabled: 'Schermafbeeldingen zijn uitgeschakeld',
    toast_print_disabled: 'Afdrukken is uitgeschakeld. Gebruik Opslaan als PDF.',
    toast_gate_removed: 'Poort verwijderd',
    toast_sections_diff_material: 'Secties gebruiken verschillende materialen ({a} vs {b}) — apart gehouden',
    toast_sections_overlap: 'Secties overlappen',
    toast_sections_joined: 'Secties samengevoegd',
    toast_merge_join: 'Samenvoegen',
    toast_merge_ignore: 'Negeren',
    toast_tips_reset: 'Tips zijn gereset',
    toast_onboarding_reset: 'Rondleiding is gereset. Herlaad om het te zien.',
    toast_region_set: 'Regio: {name}',

    // -- Hints --
    hint_first_visit: 'Zoek een adres of klik op de kaart om te beginnen',
    hint_first_point: 'Klik om meer punten toe te voegen. Elk segment toont zijn lengte.',
    hint_three_points: 'Probeer de knop Sluiten om een omtrek te voltooien',
    hint_first_gate: 'Wijzig het poorttype in het paneel rechts',
    hint_fence_type: 'Je kunt materiaalprijzen bewerken met het potloodpictogram',
    hint_fifty_feet: 'Klik op een meting om een exacte lengte in te typen',
    hint_bom_appears: 'Hoeveelheden zijn bewerkbaar \u2014 pas elke telling aan',
    hint_first_estimate: 'Deel of sla op als PDF onderaan het paneel',
    hint_mulch_tool: 'Sleep om een rechthoek te tekenen, of houd Shift ingedrukt en klik voor aangepaste vormen',
    hint_first_mulch: 'Sleep de witte handvatten om te verkleinen. Gebruik het oranje handvat om te draaien.',
    hint_shapes_picker: 'Probeer een vooraf ingestelde vorm \u2014 tik op de kaart om te plaatsen en pas dan aan',
    hint_delete_mode: 'Tik op een hek, mulchbed of poort om te selecteren voor verwijdering',
    hint_curve_mode: 'Curve maakt heklijnen vloeiend. Schakel uit voor rechte segmenten.',
    hint_new_section: 'Secties laten je verschillende hektypes en hoogtes gebruiken op hetzelfde terrein',
    hint_save_estimate: 'Sla je offerte op om er later op terug te komen of te delen met je klant',
    hint_share_flow: 'Stuur je klant een link \u2014 ze kunnen de offerte online bekijken en goedkeuren',
    hint_mobile_zoom: 'Knijp om in te zoomen voor nauwkeurigere plaatsing',
    hint_got_it: 'Begrepen',

    // -- PDF strings --
    pdf_title: 'FenceTrace',
    pdf_subtitle: 'Satelliet-hekwerk offertes',
    pdf_estimate_num: 'Offerte #',
    pdf_prepared_for: 'Opgesteld voor',
    pdf_customer: 'Klant',
    pdf_project_summary: 'Projectoverzicht',
    pdf_fence_type: 'Hekwerktype',
    pdf_height: 'Hoogte',
    pdf_total_footage: 'Totale Lengte',
    pdf_terrain: 'Terrein',
    pdf_material_breakdown: 'Materiaaloverzicht',
    pdf_item: 'Item',
    pdf_qty: 'Aantal',
    pdf_unit_cost: 'Stukprijs',
    pdf_total: 'Totaal',
    pdf_materials_total: 'Materialen Totaal',
    pdf_additional_items: 'Aanvullende Items',
    pdf_estimate_summary: 'Offerteoverzicht',
    pdf_total_estimate: 'Totale Offerte',
    pdf_valid_30_days: 'Deze offerte is 30 dagen geldig. Werkelijke kosten kunnen varieren op basis van terreinomstandigheden.',
    pdf_generated_by: 'Gegenereerd door FenceTrace',
    pdf_fence_layout: 'Hekwerk Layout',
    pdf_linear_ft: 'lineaire ft',
    pdf_curved: 'gebogen',
    pdf_flat: 'Vlak',
    pdf_slope: 'Helling (+15%)',
    pdf_rocky: 'Rotsachtig (+30%)',
    pdf_old_fence_removal: 'Verwijdering oud hekwerk',
    pdf_permit_fee: 'Vergunningskosten',
    pdf_stain_seal: 'Beits / lak',
    pdf_terrain_adjustment: 'Terreinaanpassing',
    pdf_custom_items: 'Aangepaste items',

    // -- Zoom accuracy --
    accuracy_excellent: 'Uitstekend',
    accuracy_good: 'Goed',
    accuracy_fair: 'Redelijk',
    accuracy_low: 'Laag',

    // -- Misc --
    gate_marker_label: 'POORT',
    remove_segment_title: 'Segment verwijderen',
    tap_to_edit_price: 'Tik om prijs te bewerken',
    add_section_title: 'Sectie toevoegen'
  },

  fr: {
    // -- Nav --
    nav_brand: 'FenceTrace',
    nav_tagline: 'Devis en 60 secondes',
    btn_new: 'Nouveau',
    btn_save: 'Enregistrer',
    btn_my_estimates: 'Mes Devis',
    btn_account: 'Compte',
    btn_logout: 'Deconnexion',
    btn_signin: 'Connexion',

    // -- Loading --
    loading_tagline: 'Devis de cloture par satellite',

    // -- Search --
    search_placeholder: 'Rechercher une adresse...',
    search_go: 'Aller',

    // -- Map layers --
    layer_satellite: 'Satellite',
    layer_hybrid: 'Hybride',
    layer_streets: 'Rues',
    layer_topo: 'Topo',
    layer_drone: 'Drone',

    // -- Map toolbar --
    tool_draw: 'Cloture',
    tool_gate: 'Portail',
    tool_curve: 'Courbe',
    tool_mulch: 'Paillis',
    tool_section: 'Section',
    tool_close: 'Fermer',
    tool_open: 'Ouvrir',
    tool_undo: 'Annuler',
    tool_clear: 'Effacer',
    footage_label: 'Total',
    footage_unit: 'pi',

    // -- Panel toggle (mobile) --
    panel_show_estimate: 'Afficher le Devis',

    // -- Panel sections --
    section_customer: 'Client',
    section_region: 'Region',
    section_material: 'Materiau',
    section_height: 'Hauteur',
    section_extras: 'Supplements',
    section_ground: 'Sol',
    section_gates: 'Portails',
    section_bom: 'Detail des Materiaux',
    section_custom_items: 'Elements Personnalises',
    section_mulch: 'Paillis',
    section_estimate: 'Devis',

    // -- Customer form --
    placeholder_name: 'Nom',
    placeholder_phone: 'Telephone',
    placeholder_address: 'Adresse',

    // -- Fence types --
    fence_wood: 'Bois',
    fence_vinyl: 'Vinyle',
    fence_chain_link: 'Grillage',
    fence_aluminum: 'Aluminium',
    fence_iron: 'Fer',

    // -- Height buttons --
    height_custom: 'Personnalise',

    // -- Extras / addons --
    addon_removal: 'Retirer ancienne cloture',
    addon_permit: 'Permis',
    addon_stain: 'Teinture / scellant',

    // -- Ground / terrain --
    terrain_flat: 'Plat',
    terrain_slope: 'Pente',
    terrain_rocky: 'Rocheux',

    // -- Gates --
    gates_empty: 'Placez des portails en cliquant sur la carte',
    gate_label: 'Portail',
    gate_single: 'Simple',
    gate_double: 'Double',
    gate_sliding: 'Coulissant',

    // -- BOM --
    bom_empty: 'Dessinez une cloture pour voir les materiaux',
    bom_materials_total: 'Total Materiaux',
    bom_edit_prices: 'Modifier les prix',

    // -- BOM item names --
    bom_posts: 'poteaux',
    bom_rails: 'traverses',
    bom_pickets: 'lattes',
    bom_rail_brackets: 'Supports de traverse',
    bom_post_caps: 'Chapeaux de poteau',
    bom_concrete_bags: 'Sacs de beton (25kg)',
    bom_screw_boxes: 'Vis exterieures (boite)',
    bom_panels: 'panneaux',
    bom_stiffener: 'Raidisseur de poteau aluminium',
    bom_self_tap_screws: 'Vis autotaraudeuses (boite)',
    bom_line_posts: 'poteaux intermediaires',
    bom_terminal_posts: 'poteaux terminaux',
    bom_top_rail: 'traverse superieure',
    bom_mesh_rolls: 'rouleaux de grillage',
    bom_tension_bars: 'Barres de tension',
    bom_tension_bands: 'Bandes de tension',
    bom_brace_bands: 'Bandes de renfort',
    bom_rail_end_cups: 'Embouts de traverse',
    bom_loop_caps: 'Chapeaux boucle (ligne)',
    bom_dome_caps: 'Chapeaux dome (terminal)',
    bom_carriage_bolts: 'Boulons de carrosserie 8mm',
    bom_tie_wires: 'Fils de ligature',
    bom_mounting_brackets: 'Supports de montage',
    bom_ss_screws: 'Vis autotaraudeuses inox',
    bom_bolts_screws: 'Boulons/vis',

    // -- Custom items --
    custom_add_btn: 'Ajouter main-d\'oeuvre, livraison ou autres couts',
    custom_item_placeholder: 'Nom de l\'element',
    custom_qty_placeholder: 'Qte',

    // -- Estimate summary --
    summary_fence: 'cloture',
    summary_gates: 'Portails',
    summary_removal: 'Retrait',
    summary_permit: 'Permis',
    summary_stain: 'Teinture / scellant',
    summary_terrain: 'Terrain',
    summary_custom: 'Elements personnalises',
    summary_total: 'Total',
    estimate_disclaimer: 'Les mesures sont des estimations satellite. Verifiez sur place avant le devis final.',

    // -- Panel actions --
    btn_share: 'Partager le Devis',
    btn_pdf: 'Enregistrer en PDF',

    // -- Footer --
    footer_copy: '2026 RavenWing LLC',
    footer_terms: 'Conditions',
    footer_privacy: 'Confidentialite',

    // -- Auth modal --
    auth_title: 'FenceTrace',
    auth_subtitle: 'Essai gratuit de 14 jours. Sans carte.',
    auth_login_btn: 'Connexion',
    auth_signup_btn: 'Essai Gratuit',
    auth_verify_btn: 'Verifier',
    auth_no_account: 'Pas de compte ?',
    auth_sign_up: 'S\'inscrire',
    auth_have_account: 'Vous avez un compte ?',
    auth_log_in: 'Se connecter',
    auth_check_email: 'Verifiez votre e-mail pour le code de verification.',
    auth_forgot_password: 'Mot de passe oublie ?',
    auth_forgot_info: 'Entrez votre e-mail et nous vous enverrons un code de reinitialisation.',
    auth_send_code_btn: 'Envoyer le Code',
    auth_back_to_login: 'Retour a la connexion',
    auth_reset_info: 'Entrez le code de votre e-mail et votre nouveau mot de passe.',
    auth_reset_btn: 'Reinitialiser le Mot de Passe',
    placeholder_reset_code: 'Code de reinitialisation',
    placeholder_new_password: 'Nouveau mot de passe (10+ car.)',
    placeholder_email: 'E-mail',
    placeholder_password: 'Mot de passe',
    placeholder_password_hint: 'Mot de passe (10+ car., majuscule, minuscule, chiffre)',
    placeholder_company: 'Nom de l\'entreprise',
    hint_company_name: 'Affiche sur les devis et approbations que vos clients voient',
    placeholder_verification: 'Code de verification',
    auth_email_password_required: 'E-mail et mot de passe requis',
    auth_company_required: 'Nom d\'entreprise requis',
    auth_enter_code: 'Entrez le code',
    auth_verified: 'Verifie ! Vous pouvez vous connecter.',

    // -- Trial / Paywall --
    trial_expired: 'Essai Expire',
    trial_subscribe_msg: 'Abonnez-vous pour continuer a creer des devis.',
    trial_subscribe_btn: 'S\'abonner',
    trial_subscribe_price: 'S\'abonner — $49/mois',
    trial_days_left: '{n} jours d\'essai restants',

    // -- Account modal --
    account_title: 'Compte',
    account_email: 'E-mail',
    account_status: 'Statut',
    account_next_billing: 'Prochaine facturation',
    account_plan: 'Plan',
    account_manage_sub: 'Gerer l\'Abonnement',
    account_export: 'Exporter Mes Donnees',
    account_cancel_note: 'Annulez a tout moment — sans frais, sans questions. Vos donnees restent disponibles 90 jours apres l\'annulation.',

    // -- Team --
    team_title: 'Equipe',
    team_loading: 'Chargement...',
    team_invite_placeholder: 'Adresse e-mail',
    team_invite_btn: 'Inviter',

    // -- Roles --
    roles_title: 'Roles',
    roles_loading: 'Chargement...',
    role_name_placeholder: 'Nom du role',
    role_save: 'Enregistrer le Role',
    role_cancel: 'Annuler',
    role_new: '+ Nouveau Role',

    // -- Permissions --
    perm_create_estimates: 'Creer des devis',
    perm_edit_estimates: 'Modifier des devis',
    perm_delete_estimates: 'Supprimer des devis',
    perm_share_estimates: 'Partager des devis',
    perm_export_pdf: 'Exporter en PDF',
    perm_manage_team: 'Gerer l\'equipe',
    perm_manage_roles: 'Gerer les roles',
    perm_manage_pricing: 'Gerer les prix',
    perm_manage_billing: 'Gerer la facturation',

    // -- Role names --
    role_owner: 'Proprietaire',
    role_admin: 'Administrateur',
    role_estimator: 'Estimateur',
    role_viewer: 'Observateur',

    // -- Status labels --
    status_active: 'Actif',
    status_trialing: 'Essai',
    status_expired: 'Expire',
    status_canceled: 'Annule',
    status_past_due: 'En Retard',
    status_pending: 'En Attente',

    // -- Pricing region --
    pricing_region_title: 'Region Tarifaire',
    pricing_region_desc: 'Ajuste les prix par defaut des materiaux pour votre zone. Vous pouvez modifier les prix individuels ci-dessous.',
    pricebook_title: 'Grille de Prix',
    pricebook_desc: 'Modifiez n\'importe quel prix de materiau. Laissez vide pour le prix regional par defaut.',
    pricebook_save: 'Enregistrer les Prix',
    pricebook_reset: 'Restaurer les Valeurs',

    // -- Pricing editor modal --
    pricing_edit_title: 'Modifier les Prix des Materiaux',
    pricing_edit_sub: 'Entrez vos couts fournisseur reels',
    pricing_done: 'Termine',

    // -- Keyboard shortcuts --
    shortcuts_title: 'Raccourcis Clavier',
    shortcut_draw: 'Outil cloture',
    shortcut_gate: 'Outil portail',
    shortcut_curve: 'Mode courbe',
    shortcut_section: 'Nouvelle section',
    shortcut_close: 'Fermer / ouvrir boucle',
    shortcut_undo: 'Annuler (points et portails)',
    shortcut_clear: 'Tout effacer',
    shortcut_new_est: 'Nouveau devis',
    shortcut_save: 'Enregistrer le devis',
    shortcut_my_est: 'Mes Devis',
    shortcut_share: 'Partager le devis',
    shortcut_pdf: 'Enregistrer en PDF',
    shortcut_cancel: 'Annuler / fermer',

    // -- Utility --
    btn_reset_tips: 'Reinitialiser les Conseils',
    btn_reset_onboarding: 'Reinitialiser le Tutoriel',

    // -- Estimates drawer --
    drawer_title: 'Devis Enregistres',
    drawer_estimates_tab: 'Devis',
    drawer_trash_tab: 'Corbeille',
    drawer_empty: 'Aucun devis enregistre',

    // -- Onboarding --
    onboard_step1_title: 'Recherchez une adresse',
    onboard_step1_desc: 'Tapez une adresse dans la barre de recherche pour voler vers n\'importe quelle propriete sur la carte satellite.',
    onboard_step2_title: 'Cliquez sur la carte pour tracer la cloture',
    onboard_step2_desc: 'Cliquez des points sur la carte pour tracer la cloture. Chaque segment affiche sa longueur.',
    onboard_step3_title: 'Consultez votre devis et partagez-le',
    onboard_step3_desc: 'Choisissez les materiaux, ajoutez des supplements, puis partagez ou enregistrez votre devis en PDF.',
    onboard_next: 'Suivant',
    onboard_got_it: 'Compris',

    // -- Drone overlay --
    drone_title: 'Superposition Photo Drone',
    drone_desc: 'Faites glisser les <b>coins orange</b> pour aligner la photo avec la propriete. Utilisez le curseur pour ajuster la transparence.',
    drone_see_through: 'Transparence',
    drone_got_it: 'Compris',
    drone_remove: 'Supprimer la Photo',

    // -- Map empty state --
    empty_map: 'Recherchez une adresse ou touchez la carte pour commencer',

    // -- Toast messages --
    toast_section_started: 'Section {n} commencee — cliquez sur la carte pour dessiner',
    toast_section_removed: 'Section supprimee',
    toast_segment_set: 'Segment regle a {n} pi',
    toast_zoom_closer: 'Zoomez plus pres pour un placement precis',
    toast_zoom_tip: 'Astuce : zoomez a 18+ pour la meilleure precision (~0,5 pi/pixel)',
    toast_link_copied: 'Lien copie dans le presse-papiers',
    toast_addr_not_found: 'Adresse introuvable. Essayez d\'etre plus precis.',
    toast_search_failed: 'Recherche echouee. Verifiez votre connexion.',
    toast_generating_pdf: 'Generation du PDF...',
    toast_pdf_lib_error: 'Bibliotheque PDF non chargee. Essayez de rafraichir.',
    toast_pdf_downloaded: 'PDF telecharge',
    toast_pdf_error: 'Erreur PDF : {msg}',
    toast_image_too_large: 'Image trop grande (max 50 Mo)',
    toast_drone_removed: 'Photo drone supprimee',
    toast_screenshot_disabled: 'Les captures d\'ecran sont desactivees',
    toast_print_disabled: 'L\'impression est desactivee. Utilisez Enregistrer en PDF.',
    toast_gate_removed: 'Portail supprime',
    toast_sections_diff_material: 'Les sections utilisent des materiaux differents ({a} vs {b}) — gardees separees',
    toast_sections_overlap: 'Les sections se chevauchent',
    toast_sections_joined: 'Sections jointes',
    toast_merge_join: 'Joindre',
    toast_merge_ignore: 'Ignorer',
    toast_tips_reset: 'Conseils reinitialises',
    toast_onboarding_reset: 'Tutoriel reinitialise. Rechargez pour le voir.',
    toast_region_set: 'Region : {name}',

    // -- Hints --
    hint_first_visit: 'Recherchez une adresse ou cliquez sur la carte pour commencer',
    hint_first_point: 'Cliquez pour ajouter plus de points. Chaque segment affiche sa longueur.',
    hint_three_points: 'Essayez le bouton Fermer pour completer un perimetre',
    hint_first_gate: 'Changez le type de portail dans le panneau a droite',
    hint_fence_type: 'Vous pouvez modifier les prix des materiaux avec l\'icone crayon',
    hint_fifty_feet: 'Cliquez sur une mesure pour saisir une longueur exacte',
    hint_bom_appears: 'Les quantites sont modifiables \u2014 ajustez n\'importe quel nombre',
    hint_first_estimate: 'Partagez ou enregistrez en PDF en bas du panneau',
    hint_mulch_tool: 'Glissez pour dessiner un rectangle, ou maintenez Shift et cliquez pour des formes personnalis\u00e9es',
    hint_first_mulch: 'Glissez les poign\u00e9es blanches pour redimensionner. Utilisez la poign\u00e9e orange pour pivoter.',
    hint_shapes_picker: 'Essayez une forme pr\u00e9d\u00e9finie \u2014 touchez la carte pour la placer, puis redimensionnez',
    hint_delete_mode: 'Touchez une cl\u00f4ture, un parterre de paillis ou un portail pour le s\u00e9lectionner et le supprimer',
    hint_curve_mode: 'Courbe lisse les lignes de cl\u00f4ture. D\u00e9sactivez pour des segments droits.',
    hint_new_section: 'Les sections permettent d\'utiliser diff\u00e9rents types et hauteurs de cl\u00f4ture sur la m\u00eame propri\u00e9t\u00e9',
    hint_save_estimate: 'Enregistrez votre devis pour y revenir plus tard ou le partager avec votre client',
    hint_share_flow: 'Envoyez un lien \u00e0 votre client \u2014 il peut consulter et approuver le devis en ligne',
    hint_mobile_zoom: 'Pincez pour zoomer et placer avec plus de pr\u00e9cision',
    hint_got_it: 'Compris',

    // -- PDF strings --
    pdf_title: 'FenceTrace',
    pdf_subtitle: 'Devis de cloture par satellite',
    pdf_estimate_num: 'Devis #',
    pdf_prepared_for: 'Prepare pour',
    pdf_customer: 'Client',
    pdf_project_summary: 'Resume du Projet',
    pdf_fence_type: 'Type de Cloture',
    pdf_height: 'Hauteur',
    pdf_total_footage: 'Longueur Lineaire Totale',
    pdf_terrain: 'Terrain',
    pdf_material_breakdown: 'Detail des Materiaux',
    pdf_item: 'Article',
    pdf_qty: 'Qte',
    pdf_unit_cost: 'Cout Unitaire',
    pdf_total: 'Total',
    pdf_materials_total: 'Total Materiaux',
    pdf_additional_items: 'Articles Supplementaires',
    pdf_estimate_summary: 'Resume du Devis',
    pdf_total_estimate: 'Devis Total',
    pdf_valid_30_days: 'Ce devis est valable 30 jours. Les couts reels peuvent varier selon les conditions du terrain.',
    pdf_generated_by: 'Genere par FenceTrace',
    pdf_fence_layout: 'Plan de Cloture',
    pdf_linear_ft: 'pi lineaires',
    pdf_curved: 'courbe',
    pdf_flat: 'Plat',
    pdf_slope: 'Pente (+15%)',
    pdf_rocky: 'Rocheux (+30%)',
    pdf_old_fence_removal: 'Retrait ancienne cloture',
    pdf_permit_fee: 'Frais de permis',
    pdf_stain_seal: 'Teinture / scellant',
    pdf_terrain_adjustment: 'Ajustement terrain',
    pdf_custom_items: 'Elements personnalises',

    // -- Zoom accuracy --
    accuracy_excellent: 'Excellent',
    accuracy_good: 'Bon',
    accuracy_fair: 'Moyen',
    accuracy_low: 'Faible',

    // -- Misc --
    gate_marker_label: 'PORTAIL',
    remove_segment_title: 'Supprimer le segment',
    tap_to_edit_price: 'Touchez pour modifier le prix',
    add_section_title: 'Ajouter une section'
  },

  de: {
    // -- Nav --
    nav_brand: 'FenceTrace',
    nav_tagline: 'Angebot in 60 Sekunden',
    btn_new: 'Neu',
    btn_save: 'Speichern',
    btn_my_estimates: 'Meine Angebote',
    btn_account: 'Konto',
    btn_logout: 'Abmelden',
    btn_signin: 'Anmelden',

    // -- Loading --
    loading_tagline: 'Satelliten-Zaunangebote',

    // -- Search --
    search_placeholder: 'Adresse suchen...',
    search_go: 'Los',

    // -- Map layers --
    layer_satellite: 'Satellit',
    layer_hybrid: 'Hybrid',
    layer_streets: 'Strassen',
    layer_topo: 'Topo',
    layer_drone: 'Drohne',

    // -- Map toolbar --
    tool_draw: 'Zaun',
    tool_gate: 'Tor',
    tool_curve: 'Kurve',
    tool_mulch: 'Mulch',
    tool_section: 'Abschnitt',
    tool_close: 'Schliessen',
    tool_open: 'Oeffnen',
    tool_undo: 'Rueckgaengig',
    tool_clear: 'Loeschen',
    footage_label: 'Gesamt',
    footage_unit: 'ft',

    // -- Panel toggle (mobile) --
    panel_show_estimate: 'Angebot Anzeigen',

    // -- Panel sections --
    section_customer: 'Kunde',
    section_region: 'Region',
    section_material: 'Material',
    section_height: 'Hoehe',
    section_extras: 'Extras',
    section_ground: 'Boden',
    section_gates: 'Tore',
    section_bom: 'Materialaufstellung',
    section_custom_items: 'Eigene Posten',
    section_mulch: 'Mulch',
    section_estimate: 'Angebot',

    // -- Customer form --
    placeholder_name: 'Name',
    placeholder_phone: 'Telefon',
    placeholder_address: 'Adresse',

    // -- Fence types --
    fence_wood: 'Holz',
    fence_vinyl: 'Vinyl',
    fence_chain_link: 'Maschendraht',
    fence_aluminum: 'Aluminium',
    fence_iron: 'Eisen',

    // -- Height buttons --
    height_custom: 'Eigene',

    // -- Extras / addons --
    addon_removal: 'Alten Zaun entfernen',
    addon_permit: 'Genehmigung',
    addon_stain: 'Beize / Versiegelung',

    // -- Ground / terrain --
    terrain_flat: 'Flach',
    terrain_slope: 'Hang',
    terrain_rocky: 'Felsig',

    // -- Gates --
    gates_empty: 'Tore durch Klicken auf die Karte platzieren',
    gate_label: 'Tor',
    gate_single: 'Einzel',
    gate_double: 'Doppel',
    gate_sliding: 'Schiebe',

    // -- BOM --
    bom_empty: 'Zaun zeichnen um Materialien zu sehen',
    bom_materials_total: 'Material Gesamt',
    bom_edit_prices: 'Preise bearbeiten',

    // -- BOM item names --
    bom_posts: 'Pfosten',
    bom_rails: 'Riegel',
    bom_pickets: 'Latten',
    bom_rail_brackets: 'Riegelhalter',
    bom_post_caps: 'Pfostenkappen',
    bom_concrete_bags: 'Betonsaecke (25kg)',
    bom_screw_boxes: 'Aussenschrauben (Karton)',
    bom_panels: 'Paneele',
    bom_stiffener: 'Aluminium-Pfostenverstaerker',
    bom_self_tap_screws: 'Selbstbohrschrauben (Karton)',
    bom_line_posts: 'Zwischenpfosten',
    bom_terminal_posts: 'Endpfosten',
    bom_top_rail: 'Oberriegel',
    bom_mesh_rolls: 'Gitterrollen',
    bom_tension_bars: 'Spannstaebe',
    bom_tension_bands: 'Spannbaender',
    bom_brace_bands: 'Stuetzbaender',
    bom_rail_end_cups: 'Riegelendkappen',
    bom_loop_caps: 'Schleifenkappen (Linie)',
    bom_dome_caps: 'Kugelkappen (Ende)',
    bom_carriage_bolts: 'Schlossschrauben 8mm',
    bom_tie_wires: 'Bindedraeht',
    bom_mounting_brackets: 'Montagewinkel',
    bom_ss_screws: 'Edelstahl-Selbstbohrschrauben',
    bom_bolts_screws: 'Bolzen/Schrauben',

    // -- Custom items --
    custom_add_btn: 'Arbeit, Lieferung oder andere Kosten hinzufuegen',
    custom_item_placeholder: 'Postenname',
    custom_qty_placeholder: 'Menge',

    // -- Estimate summary --
    summary_fence: 'Zaun',
    summary_gates: 'Tore',
    summary_removal: 'Entfernung',
    summary_permit: 'Genehmigung',
    summary_stain: 'Beize / Versiegelung',
    summary_terrain: 'Gelaende',
    summary_custom: 'Eigene Posten',
    summary_total: 'Gesamt',
    estimate_disclaimer: 'Messungen sind Satellitenschaetzungen. Vor endgueltigem Angebot vor Ort ueberpruefen.',

    // -- Panel actions --
    btn_share: 'Angebot Teilen',
    btn_pdf: 'Als PDF Speichern',

    // -- Footer --
    footer_copy: '2026 RavenWing LLC',
    footer_terms: 'AGB',
    footer_privacy: 'Datenschutz',

    // -- Auth modal --
    auth_title: 'FenceTrace',
    auth_subtitle: '14 Tage kostenlos testen. Keine Karte noetig.',
    auth_login_btn: 'Anmelden',
    auth_signup_btn: 'Kostenlos Testen',
    auth_verify_btn: 'Verifizieren',
    auth_no_account: 'Kein Konto?',
    auth_sign_up: 'Registrieren',
    auth_have_account: 'Haben Sie ein Konto?',
    auth_log_in: 'Anmelden',
    auth_check_email: 'Pruefen Sie Ihre E-Mail auf einen Verifizierungscode.',
    auth_forgot_password: 'Passwort vergessen?',
    auth_forgot_info: 'Geben Sie Ihre E-Mail ein und wir senden Ihnen einen Zurucksetzungscode.',
    auth_send_code_btn: 'Code Senden',
    auth_back_to_login: 'Zuruck zur Anmeldung',
    auth_reset_info: 'Geben Sie den Code aus Ihrer E-Mail und Ihr neues Passwort ein.',
    auth_reset_btn: 'Passwort Zurucksetzen',
    placeholder_reset_code: 'Zurucksetzungscode',
    placeholder_new_password: 'Neues Passwort (10+ Zeichen)',
    placeholder_email: 'E-Mail',
    placeholder_password: 'Passwort',
    placeholder_password_hint: 'Passwort (10+ Zeichen, Gross-, Kleinbuchstabe, Zahl)',
    placeholder_company: 'Firmenname',
    hint_company_name: 'Wird auf Angeboten und Genehmigungen angezeigt, die Ihre Kunden sehen',
    placeholder_verification: 'Verifizierungscode',
    auth_email_password_required: 'E-Mail und Passwort erforderlich',
    auth_company_required: 'Firmenname erforderlich',
    auth_enter_code: 'Code eingeben',
    auth_verified: 'Verifiziert! Sie koennen sich jetzt anmelden.',

    // -- Trial / Paywall --
    trial_expired: 'Testphase Abgelaufen',
    trial_subscribe_msg: 'Abonnieren Sie, um weiter Angebote zu erstellen.',
    trial_subscribe_btn: 'Abonnieren',
    trial_subscribe_price: 'Abonnieren — $49/Monat',
    trial_days_left: '{n} Tage Testphase verbleibend',

    // -- Account modal --
    account_title: 'Konto',
    account_email: 'E-Mail',
    account_status: 'Status',
    account_next_billing: 'Naechste Abrechnung',
    account_plan: 'Plan',
    account_manage_sub: 'Abonnement Verwalten',
    account_export: 'Meine Daten Exportieren',
    account_cancel_note: 'Jederzeit kuendigen — keine Gebuehren, keine Fragen. Ihre Daten bleiben 90 Tage nach Kuendigung verfuegbar.',

    // -- Team --
    team_title: 'Team',
    team_loading: 'Laden...',
    team_invite_placeholder: 'E-Mail-Adresse',
    team_invite_btn: 'Einladen',

    // -- Roles --
    roles_title: 'Rollen',
    roles_loading: 'Laden...',
    role_name_placeholder: 'Rollenname',
    role_save: 'Rolle Speichern',
    role_cancel: 'Abbrechen',
    role_new: '+ Neue Rolle',

    // -- Permissions --
    perm_create_estimates: 'Angebote erstellen',
    perm_edit_estimates: 'Angebote bearbeiten',
    perm_delete_estimates: 'Angebote loeschen',
    perm_share_estimates: 'Angebote teilen',
    perm_export_pdf: 'PDF exportieren',
    perm_manage_team: 'Team verwalten',
    perm_manage_roles: 'Rollen verwalten',
    perm_manage_pricing: 'Preise verwalten',
    perm_manage_billing: 'Abrechnung verwalten',

    // -- Role names --
    role_owner: 'Inhaber',
    role_admin: 'Administrator',
    role_estimator: 'Kalkulant',
    role_viewer: 'Betrachter',

    // -- Status labels --
    status_active: 'Aktiv',
    status_trialing: 'Testphase',
    status_expired: 'Abgelaufen',
    status_canceled: 'Gekuendigt',
    status_past_due: 'Ueberfaellig',
    status_pending: 'Ausstehend',

    // -- Pricing region --
    pricing_region_title: 'Preisregion',
    pricing_region_desc: 'Passt Standardmaterialpreise fuer Ihre Region an. Sie koennen einzelne Preise unten aendern.',
    pricebook_title: 'Preisliste',
    pricebook_desc: 'Beliebigen Materialpreis ueberschreiben. Leer lassen fuer regionalen Standard.',
    pricebook_save: 'Preise Speichern',
    pricebook_reset: 'Standardwerte Wiederherstellen',

    // -- Pricing editor modal --
    pricing_edit_title: 'Materialpreise Bearbeiten',
    pricing_edit_sub: 'Geben Sie Ihre tatsaechlichen Lieferantenkosten ein',
    pricing_done: 'Fertig',

    // -- Keyboard shortcuts --
    shortcuts_title: 'Tastenkuerzel',
    shortcut_draw: 'Zaun-Werkzeug',
    shortcut_gate: 'Torwerkzeug',
    shortcut_curve: 'Kurvenmodus',
    shortcut_section: 'Neuer Abschnitt',
    shortcut_close: 'Schliessen / Oeffnen Schleife',
    shortcut_undo: 'Rueckgaengig (Punkte & Tore)',
    shortcut_clear: 'Alles loeschen',
    shortcut_new_est: 'Neues Angebot',
    shortcut_save: 'Angebot speichern',
    shortcut_my_est: 'Meine Angebote',
    shortcut_share: 'Angebot teilen',
    shortcut_pdf: 'Als PDF speichern',
    shortcut_cancel: 'Abbrechen / schliessen',

    // -- Utility --
    btn_reset_tips: 'Tipps Zuruecksetzen',
    btn_reset_onboarding: 'Einfuehrung Zuruecksetzen',

    // -- Estimates drawer --
    drawer_title: 'Gespeicherte Angebote',
    drawer_estimates_tab: 'Angebote',
    drawer_trash_tab: 'Papierkorb',
    drawer_empty: 'Noch keine gespeicherten Angebote',

    // -- Onboarding --
    onboard_step1_title: 'Suchen Sie eine Adresse',
    onboard_step1_desc: 'Geben Sie eine Adresse in die Suchleiste ein, um zu einem Grundstueck auf der Satellitenkarte zu fliegen.',
    onboard_step2_title: 'Klicken Sie auf die Karte um Zaunlinien zu zeichnen',
    onboard_step2_desc: 'Klicken Sie Punkte auf der Karte um den Zaun zu zeichnen. Jedes Segment zeigt seine Laenge.',
    onboard_step3_title: 'Ueberpruefen Sie Ihr Angebot und teilen Sie es',
    onboard_step3_desc: 'Waehlen Sie Materialien, fuegen Sie Extras hinzu, dann teilen oder speichern Sie Ihr Angebot als PDF.',
    onboard_next: 'Weiter',
    onboard_got_it: 'Verstanden',

    // -- Drone overlay --
    drone_title: 'Drohnen-Foto-Overlay',
    drone_desc: 'Ziehen Sie die <b>orangenen Ecken</b> um das Foto am Grundstueck auszurichten. Verwenden Sie den Schieberegler fuer die Transparenz.',
    drone_see_through: 'Durchsichtig',
    drone_got_it: 'Verstanden',
    drone_remove: 'Foto Entfernen',

    // -- Map empty state --
    empty_map: 'Adresse suchen oder auf die Karte tippen zum Starten',

    // -- Toast messages --
    toast_section_started: 'Abschnitt {n} gestartet — auf die Karte klicken zum Zeichnen',
    toast_section_removed: 'Abschnitt entfernt',
    toast_segment_set: 'Segment auf {n} ft gesetzt',
    toast_zoom_closer: 'Naeher heranzoomen fuer genaue Platzierung',
    toast_zoom_tip: 'Tipp: Zoom 18+ fuer beste Genauigkeit (~0,5 ft/Pixel)',
    toast_link_copied: 'Link in Zwischenablage kopiert',
    toast_addr_not_found: 'Adresse nicht gefunden. Versuchen Sie es genauer.',
    toast_search_failed: 'Suche fehlgeschlagen. Ueberpruefen Sie Ihre Verbindung.',
    toast_generating_pdf: 'PDF wird generiert...',
    toast_pdf_lib_error: 'PDF-Bibliothek nicht geladen. Versuchen Sie zu aktualisieren.',
    toast_pdf_downloaded: 'PDF heruntergeladen',
    toast_pdf_error: 'PDF-Fehler: {msg}',
    toast_image_too_large: 'Bild zu gross (max 50MB)',
    toast_drone_removed: 'Drohnenfoto entfernt',
    toast_screenshot_disabled: 'Screenshots sind deaktiviert',
    toast_print_disabled: 'Drucken ist deaktiviert. Verwenden Sie Als PDF Speichern.',
    toast_gate_removed: 'Tor entfernt',
    toast_sections_diff_material: 'Abschnitte verwenden verschiedene Materialien ({a} vs {b}) — getrennt gehalten',
    toast_sections_overlap: 'Abschnitte ueberlappen sich',
    toast_sections_joined: 'Abschnitte verbunden',
    toast_merge_join: 'Verbinden',
    toast_merge_ignore: 'Ignorieren',
    toast_tips_reset: 'Tipps wurden zurueckgesetzt',
    toast_onboarding_reset: 'Einfuehrung wurde zurueckgesetzt. Neu laden um sie zu sehen.',
    toast_region_set: 'Region: {name}',

    // -- Hints --
    hint_first_visit: 'Adresse suchen oder auf die Karte klicken zum Starten',
    hint_first_point: 'Klicken um weitere Punkte hinzuzufuegen. Jedes Segment zeigt seine Laenge.',
    hint_three_points: 'Versuchen Sie die Schliessen-Taste um einen Umkreis zu vervollstaendigen',
    hint_first_gate: 'Aendern Sie den Tortyp im Panel rechts',
    hint_fence_type: 'Sie koennen Materialpreise mit dem Stiftsymbol bearbeiten',
    hint_fifty_feet: 'Klicken Sie auf eine Messung um eine genaue Laenge einzugeben',
    hint_bom_appears: 'Mengen sind bearbeitbar \u2014 passen Sie jede Anzahl an',
    hint_first_estimate: 'Teilen oder als PDF speichern am unteren Panelrand',
    hint_mulch_tool: 'Ziehen zum Zeichnen eines Rechtecks, oder Shift gedr\u00fcckt halten und klicken f\u00fcr individuelle Formen',
    hint_first_mulch: 'Ziehen Sie die wei\u00dfen Griffe zum \u00c4ndern der Gr\u00f6\u00dfe. Nutzen Sie den orangefarbenen Griff zum Drehen.',
    hint_shapes_picker: 'Probieren Sie eine Vorlage \u2014 tippen Sie auf die Karte zum Platzieren, dann anpassen',
    hint_delete_mode: 'Tippen Sie auf einen Zaun, ein Mulchbeet oder ein Tor zum Ausw\u00e4hlen und L\u00f6schen',
    hint_curve_mode: 'Kurve gl\u00e4ttet Zaunlinien. Deaktivieren f\u00fcr gerade Segmente.',
    hint_new_section: 'Abschnitte erm\u00f6glichen verschiedene Zauntypen und H\u00f6hen auf demselben Grundst\u00fcck',
    hint_save_estimate: 'Speichern Sie Ihr Angebot, um sp\u00e4ter darauf zur\u00fcckzukommen oder es mit Ihrem Kunden zu teilen',
    hint_share_flow: 'Senden Sie Ihrem Kunden einen Link \u2014 er kann das Angebot online pr\u00fcfen und genehmigen',
    hint_mobile_zoom: 'Zum Zoomen zusammendr\u00fccken f\u00fcr pr\u00e4zisere Platzierung',
    hint_got_it: 'Verstanden',

    // -- PDF strings --
    pdf_title: 'FenceTrace',
    pdf_subtitle: 'Satelliten-Zaunangebote',
    pdf_estimate_num: 'Angebot #',
    pdf_prepared_for: 'Erstellt fuer',
    pdf_customer: 'Kunde',
    pdf_project_summary: 'Projektuebersicht',
    pdf_fence_type: 'Zauntyp',
    pdf_height: 'Hoehe',
    pdf_total_footage: 'Gesamtlaenge',
    pdf_terrain: 'Gelaende',
    pdf_material_breakdown: 'Materialaufstellung',
    pdf_item: 'Position',
    pdf_qty: 'Menge',
    pdf_unit_cost: 'Stueckkosten',
    pdf_total: 'Gesamt',
    pdf_materials_total: 'Material Gesamt',
    pdf_additional_items: 'Zusaetzliche Posten',
    pdf_estimate_summary: 'Angebotsuebersicht',
    pdf_total_estimate: 'Gesamtangebot',
    pdf_valid_30_days: 'Dieses Angebot ist 30 Tage gueltig. Tatsaechliche Kosten koennen je nach Gelaendebedingungen variieren.',
    pdf_generated_by: 'Erstellt mit FenceTrace',
    pdf_fence_layout: 'Zaun-Layout',
    pdf_linear_ft: 'laufende ft',
    pdf_curved: 'gebogen',
    pdf_flat: 'Flach',
    pdf_slope: 'Hang (+15%)',
    pdf_rocky: 'Felsig (+30%)',
    pdf_old_fence_removal: 'Altenzaun-Entfernung',
    pdf_permit_fee: 'Genehmigungsgebuehr',
    pdf_stain_seal: 'Beize / Versiegelung',
    pdf_terrain_adjustment: 'Gelaendeanpassung',
    pdf_custom_items: 'Eigene Posten',

    // -- Zoom accuracy --
    accuracy_excellent: 'Ausgezeichnet',
    accuracy_good: 'Gut',
    accuracy_fair: 'Mittel',
    accuracy_low: 'Niedrig',

    // -- Misc --
    gate_marker_label: 'TOR',
    remove_segment_title: 'Segment entfernen',
    tap_to_edit_price: 'Tippen um Preis zu bearbeiten',
    add_section_title: 'Abschnitt hinzufuegen'
  },

  pt: {
    // -- Nav --
    nav_brand: 'FenceTrace',
    nav_tagline: 'Orcamento em 60 segundos',
    btn_new: 'Novo',
    btn_save: 'Salvar',
    btn_my_estimates: 'Meus Orcamentos',
    btn_account: 'Conta',
    btn_logout: 'Sair',
    btn_signin: 'Entrar',

    // -- Loading --
    loading_tagline: 'Orcamentos de cercas por satelite',

    // -- Search --
    search_placeholder: 'Buscar endereco...',
    search_go: 'Ir',

    // -- Map layers --
    layer_satellite: 'Satelite',
    layer_hybrid: 'Hibrido',
    layer_streets: 'Ruas',
    layer_topo: 'Topo',
    layer_drone: 'Drone',

    // -- Map toolbar --
    tool_draw: 'Cerca',
    tool_gate: 'Portao',
    tool_curve: 'Curva',
    tool_mulch: 'Cobertura',
    tool_section: 'Secao',
    tool_close: 'Fechar',
    tool_open: 'Abrir',
    tool_undo: 'Desfazer',
    tool_clear: 'Limpar',
    footage_label: 'Total',
    footage_unit: 'pes',

    // -- Panel toggle (mobile) --
    panel_show_estimate: 'Mostrar Orcamento',

    // -- Panel sections --
    section_customer: 'Cliente',
    section_region: 'Regiao',
    section_material: 'Material',
    section_height: 'Altura',
    section_extras: 'Extras',
    section_ground: 'Solo',
    section_gates: 'Portoes',
    section_bom: 'Detalhamento de Materiais',
    section_custom_items: 'Itens Personalizados',
    section_mulch: 'Cobertura',
    section_estimate: 'Orcamento',

    // -- Customer form --
    placeholder_name: 'Nome',
    placeholder_phone: 'Telefone',
    placeholder_address: 'Endereco',

    // -- Fence types --
    fence_wood: 'Madeira',
    fence_vinyl: 'Vinil',
    fence_chain_link: 'Tela',
    fence_aluminum: 'Aluminio',
    fence_iron: 'Ferro',

    // -- Height buttons --
    height_custom: 'Personalizado',

    // -- Extras / addons --
    addon_removal: 'Remover cerca antiga',
    addon_permit: 'Licenca',
    addon_stain: 'Verniz / selante',

    // -- Ground / terrain --
    terrain_flat: 'Plano',
    terrain_slope: 'Inclinado',
    terrain_rocky: 'Rochoso',

    // -- Gates --
    gates_empty: 'Coloque portoes clicando no mapa',
    gate_label: 'Portao',
    gate_single: 'Simples',
    gate_double: 'Duplo',
    gate_sliding: 'Deslizante',

    // -- BOM --
    bom_empty: 'Desenhe a cerca para ver materiais',
    bom_materials_total: 'Total de Materiais',
    bom_edit_prices: 'Editar precos',

    // -- BOM item names --
    bom_posts: 'postes',
    bom_rails: 'travessas',
    bom_pickets: 'ripas',
    bom_rail_brackets: 'Suportes de travessa',
    bom_post_caps: 'Tampas de poste',
    bom_concrete_bags: 'Sacos de concreto (25kg)',
    bom_screw_boxes: 'Parafusos externos (caixa)',
    bom_panels: 'paineis',
    bom_stiffener: 'Reforco de aluminio para poste',
    bom_self_tap_screws: 'Parafusos autoperfurantes (caixa)',
    bom_line_posts: 'postes intermediarios',
    bom_terminal_posts: 'postes terminais',
    bom_top_rail: 'travessa superior',
    bom_mesh_rolls: 'rolos de tela',
    bom_tension_bars: 'Barras de tensao',
    bom_tension_bands: 'Faixas de tensao',
    bom_brace_bands: 'Faixas de reforco',
    bom_rail_end_cups: 'Tampas de extremidade',
    bom_loop_caps: 'Tampas de laco (linha)',
    bom_dome_caps: 'Tampas domo (terminal)',
    bom_carriage_bolts: 'Parafusos de carruagem 8mm',
    bom_tie_wires: 'Arames de amarracao',
    bom_mounting_brackets: 'Suportes de montagem',
    bom_ss_screws: 'Parafusos inox autoperfurantes',
    bom_bolts_screws: 'Parafusos/porcas',

    // -- Custom items --
    custom_add_btn: 'Adicionar mao de obra, entrega ou outros custos',
    custom_item_placeholder: 'Nome do item',
    custom_qty_placeholder: 'Qtd',

    // -- Estimate summary --
    summary_fence: 'cerca',
    summary_gates: 'Portoes',
    summary_removal: 'Remocao',
    summary_permit: 'Licenca',
    summary_stain: 'Verniz / selante',
    summary_terrain: 'Terreno',
    summary_custom: 'Itens personalizados',
    summary_total: 'Total',
    estimate_disclaimer: 'Medicoes sao estimativas por satelite. Verifique no local antes do orcamento final.',

    // -- Panel actions --
    btn_share: 'Compartilhar Orcamento',
    btn_pdf: 'Salvar como PDF',

    // -- Footer --
    footer_copy: '2026 RavenWing LLC',
    footer_terms: 'Termos',
    footer_privacy: 'Privacidade',

    // -- Auth modal --
    auth_title: 'FenceTrace',
    auth_subtitle: 'Teste gratis de 14 dias. Sem cartao.',
    auth_login_btn: 'Entrar',
    auth_signup_btn: 'Teste Gratis',
    auth_verify_btn: 'Verificar',
    auth_no_account: 'Sem conta?',
    auth_sign_up: 'Cadastrar',
    auth_have_account: 'Tem uma conta?',
    auth_log_in: 'Entrar',
    auth_check_email: 'Verifique seu e-mail para o codigo de verificacao.',
    auth_forgot_password: 'Esqueceu a senha?',
    auth_forgot_info: 'Digite seu e-mail e enviaremos um codigo de redefinicao.',
    auth_send_code_btn: 'Enviar Codigo',
    auth_back_to_login: 'Voltar ao login',
    auth_reset_info: 'Digite o codigo do seu e-mail e sua nova senha.',
    auth_reset_btn: 'Redefinir Senha',
    placeholder_reset_code: 'Codigo de redefinicao',
    placeholder_new_password: 'Nova senha (10+ caracteres)',
    placeholder_email: 'E-mail',
    placeholder_password: 'Senha',
    placeholder_password_hint: 'Senha (10+ caracteres, maiuscula, minuscula, numero)',
    placeholder_company: 'Nome da empresa',
    hint_company_name: 'Exibido em orcamentos e aprovacoes que seus clientes veem',
    placeholder_verification: 'Codigo de verificacao',
    auth_email_password_required: 'E-mail e senha obrigatorios',
    auth_company_required: 'Nome da empresa obrigatorio',
    auth_enter_code: 'Digite o codigo',
    auth_verified: 'Verificado! Voce ja pode entrar.',

    // -- Trial / Paywall --
    trial_expired: 'Teste Expirado',
    trial_subscribe_msg: 'Assine para continuar criando orcamentos.',
    trial_subscribe_btn: 'Assinar',
    trial_subscribe_price: 'Assinar — $49/mes',
    trial_days_left: '{n} dias restantes de teste',

    // -- Account modal --
    account_title: 'Conta',
    account_email: 'E-mail',
    account_status: 'Status',
    account_next_billing: 'Proxima cobranca',
    account_plan: 'Plano',
    account_manage_sub: 'Gerenciar Assinatura',
    account_export: 'Exportar Meus Dados',
    account_cancel_note: 'Cancele quando quiser — sem taxas, sem perguntas. Seus dados ficam disponiveis por 90 dias apos o cancelamento.',

    // -- Team --
    team_title: 'Equipe',
    team_loading: 'Carregando...',
    team_invite_placeholder: 'Endereco de e-mail',
    team_invite_btn: 'Convidar',

    // -- Roles --
    roles_title: 'Funcoes',
    roles_loading: 'Carregando...',
    role_name_placeholder: 'Nome da funcao',
    role_save: 'Salvar Funcao',
    role_cancel: 'Cancelar',
    role_new: '+ Nova Funcao',

    // -- Permissions --
    perm_create_estimates: 'Criar orcamentos',
    perm_edit_estimates: 'Editar orcamentos',
    perm_delete_estimates: 'Excluir orcamentos',
    perm_share_estimates: 'Compartilhar orcamentos',
    perm_export_pdf: 'Exportar PDF',
    perm_manage_team: 'Gerenciar equipe',
    perm_manage_roles: 'Gerenciar funcoes',
    perm_manage_pricing: 'Gerenciar precos',
    perm_manage_billing: 'Gerenciar cobranca',

    // -- Role names --
    role_owner: 'Proprietario',
    role_admin: 'Administrador',
    role_estimator: 'Orcamentista',
    role_viewer: 'Visualizador',

    // -- Status labels --
    status_active: 'Ativo',
    status_trialing: 'Teste',
    status_expired: 'Expirado',
    status_canceled: 'Cancelado',
    status_past_due: 'Em Atraso',
    status_pending: 'Pendente',

    // -- Pricing region --
    pricing_region_title: 'Regiao de Precos',
    pricing_region_desc: 'Ajusta precos padrao de materiais para sua area. Voce pode alterar precos individuais abaixo.',
    pricebook_title: 'Tabela de Precos',
    pricebook_desc: 'Altere qualquer preco de material. Deixe em branco para usar o padrao regional.',
    pricebook_save: 'Salvar Precos',
    pricebook_reset: 'Restaurar Padroes',

    // -- Pricing editor modal --
    pricing_edit_title: 'Editar Precos de Materiais',
    pricing_edit_sub: 'Insira seus custos reais de fornecedor',
    pricing_done: 'Pronto',

    // -- Keyboard shortcuts --
    shortcuts_title: 'Atalhos de Teclado',
    shortcut_draw: 'Ferramenta cerca',
    shortcut_gate: 'Ferramenta portao',
    shortcut_curve: 'Modo curva',
    shortcut_section: 'Nova secao',
    shortcut_close: 'Fechar / abrir laco',
    shortcut_undo: 'Desfazer (pontos e portoes)',
    shortcut_clear: 'Limpar tudo',
    shortcut_new_est: 'Novo orcamento',
    shortcut_save: 'Salvar orcamento',
    shortcut_my_est: 'Meus Orcamentos',
    shortcut_share: 'Compartilhar orcamento',
    shortcut_pdf: 'Salvar como PDF',
    shortcut_cancel: 'Cancelar / fechar',

    // -- Utility --
    btn_reset_tips: 'Redefinir Dicas',
    btn_reset_onboarding: 'Redefinir Tutorial',

    // -- Estimates drawer --
    drawer_title: 'Orcamentos Salvos',
    drawer_estimates_tab: 'Orcamentos',
    drawer_trash_tab: 'Lixeira',
    drawer_empty: 'Nenhum orcamento salvo ainda',

    // -- Onboarding --
    onboard_step1_title: 'Busque um endereco',
    onboard_step1_desc: 'Digite um endereco na barra de busca para ir a qualquer propriedade no mapa de satelite.',
    onboard_step2_title: 'Clique no mapa para desenhar linhas de cerca',
    onboard_step2_desc: 'Clique pontos no mapa para tracar a cerca. Cada segmento mostra seu comprimento.',
    onboard_step3_title: 'Revise seu orcamento e compartilhe',
    onboard_step3_desc: 'Escolha materiais, adicione extras, depois compartilhe ou salve seu orcamento como PDF.',
    onboard_next: 'Proximo',
    onboard_got_it: 'Entendi',

    // -- Drone overlay --
    drone_title: 'Sobreposicao de Foto de Drone',
    drone_desc: 'Arraste os <b>cantos laranjas</b> para alinhar a foto com a propriedade. Use o controle para ajustar a transparencia.',
    drone_see_through: 'Transparencia',
    drone_got_it: 'Entendi',
    drone_remove: 'Remover Foto',

    // -- Map empty state --
    empty_map: 'Busque um endereco ou toque no mapa para comecar',

    // -- Toast messages --
    toast_section_started: 'Secao {n} iniciada — clique no mapa para desenhar',
    toast_section_removed: 'Secao removida',
    toast_segment_set: 'Segmento definido para {n} pes',
    toast_zoom_closer: 'Aproxime mais para posicionamento preciso',
    toast_zoom_tip: 'Dica: zoom 18+ para melhor precisao (~0,5 pes/pixel)',
    toast_link_copied: 'Link copiado para a area de transferencia',
    toast_addr_not_found: 'Endereco nao encontrado. Tente ser mais especifico.',
    toast_search_failed: 'Busca falhou. Verifique sua conexao.',
    toast_generating_pdf: 'Gerando PDF...',
    toast_pdf_lib_error: 'Biblioteca PDF nao carregada. Tente atualizar.',
    toast_pdf_downloaded: 'PDF baixado',
    toast_pdf_error: 'Erro de PDF: {msg}',
    toast_image_too_large: 'Imagem muito grande (max 50MB)',
    toast_drone_removed: 'Foto de drone removida',
    toast_screenshot_disabled: 'Capturas de tela desativadas',
    toast_print_disabled: 'Impressao desativada. Use Salvar como PDF.',
    toast_gate_removed: 'Portao removido',
    toast_sections_diff_material: 'Secoes usam materiais diferentes ({a} vs {b}) — mantidas separadas',
    toast_sections_overlap: 'Secoes se sobrepoem',
    toast_sections_joined: 'Secoes unidas',
    toast_merge_join: 'Unir',
    toast_merge_ignore: 'Ignorar',
    toast_tips_reset: 'Dicas redefinidas',
    toast_onboarding_reset: 'Tutorial redefinido. Recarregue para ver.',
    toast_region_set: 'Regiao: {name}',

    // -- Hints --
    hint_first_visit: 'Busque um endereco ou clique no mapa para comecar',
    hint_first_point: 'Clique para adicionar mais pontos. Cada segmento mostra seu comprimento.',
    hint_three_points: 'Tente o botao Fechar para completar um perimetro',
    hint_first_gate: 'Mude o tipo de portao no painel a direita',
    hint_fence_type: 'Voce pode editar precos de materiais com o icone de lapis',
    hint_fifty_feet: 'Clique em qualquer medida para digitar um comprimento exato',
    hint_bom_appears: 'Quantidades sao editaveis \u2014 ajuste qualquer contagem',
    hint_first_estimate: 'Compartilhe ou salve como PDF na parte inferior do painel',
    hint_mulch_tool: 'Arraste para desenhar um ret\u00e2ngulo, ou segure Shift e clique para formas personalizadas',
    hint_first_mulch: 'Arraste as al\u00e7as brancas para redimensionar. Use a al\u00e7a laranja para girar.',
    hint_shapes_picker: 'Experimente uma forma predefinida \u2014 toque no mapa para posicionar e depois redimensione',
    hint_delete_mode: 'Toque em qualquer cerca, canteiro de cobertura ou port\u00e3o para selecionar e excluir',
    hint_curve_mode: 'Curva suaviza as linhas da cerca. Desative para segmentos retos.',
    hint_new_section: 'Se\u00e7\u00f5es permitem usar diferentes tipos e alturas de cerca na mesma propriedade',
    hint_save_estimate: 'Salve seu or\u00e7amento para voltar a ele depois ou compartilhar com seu cliente',
    hint_share_flow: 'Envie ao seu cliente um link \u2014 ele pode revisar e aprovar o or\u00e7amento online',
    hint_mobile_zoom: 'Aperte para ampliar e posicionar com mais precis\u00e3o',
    hint_got_it: 'Entendi',

    // -- PDF strings --
    pdf_title: 'FenceTrace',
    pdf_subtitle: 'Orcamentos de cercas por satelite',
    pdf_estimate_num: 'Orcamento #',
    pdf_prepared_for: 'Preparado para',
    pdf_customer: 'Cliente',
    pdf_project_summary: 'Resumo do Projeto',
    pdf_fence_type: 'Tipo de Cerca',
    pdf_height: 'Altura',
    pdf_total_footage: 'Comprimento Linear Total',
    pdf_terrain: 'Terreno',
    pdf_material_breakdown: 'Detalhamento de Materiais',
    pdf_item: 'Item',
    pdf_qty: 'Qtd',
    pdf_unit_cost: 'Custo Unitario',
    pdf_total: 'Total',
    pdf_materials_total: 'Total de Materiais',
    pdf_additional_items: 'Itens Adicionais',
    pdf_estimate_summary: 'Resumo do Orcamento',
    pdf_total_estimate: 'Orcamento Total',
    pdf_valid_30_days: 'Este orcamento e valido por 30 dias. Custos reais podem variar conforme condicoes do terreno.',
    pdf_generated_by: 'Gerado pelo FenceTrace',
    pdf_fence_layout: 'Layout da Cerca',
    pdf_linear_ft: 'pes lineares',
    pdf_curved: 'curvada',
    pdf_flat: 'Plano',
    pdf_slope: 'Inclinado (+15%)',
    pdf_rocky: 'Rochoso (+30%)',
    pdf_old_fence_removal: 'Remocao de cerca antiga',
    pdf_permit_fee: 'Taxa de licenca',
    pdf_stain_seal: 'Verniz / selante',
    pdf_terrain_adjustment: 'Ajuste de terreno',
    pdf_custom_items: 'Itens personalizados',

    // -- Zoom accuracy --
    accuracy_excellent: 'Excelente',
    accuracy_good: 'Bom',
    accuracy_fair: 'Regular',
    accuracy_low: 'Baixo',

    // -- Misc --
    gate_marker_label: 'PORTAO',
    remove_segment_title: 'Remover segmento',
    tap_to_edit_price: 'Toque para editar preco',
    add_section_title: 'Adicionar secao'
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
