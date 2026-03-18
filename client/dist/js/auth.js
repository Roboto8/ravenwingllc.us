// === Cognito Auth (raw API, no Amplify) ===
const Auth = {
  region: 'us-east-1',
  userPoolId: '', // Set after deploy
  clientId: '',   // Set after deploy
  tokens: null,
  user: null,

  // Set these after deploying serverless
  configure(userPoolId, clientId) {
    this.userPoolId = userPoolId;
    this.clientId = clientId;
    this.restore();
  },

  get endpoint() {
    return `https://cognito-idp.${this.region}.amazonaws.com/`;
  },

  async _call(action, params) {
    const resp = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.' + action
      },
      body: JSON.stringify(params)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || data.__type || 'Auth error');
    return data;
  },

  async signup(email, password, companyName, inviteToken) {
    var attrs = [
      { Name: 'email', Value: email },
      { Name: 'custom:companyName', Value: companyName || 'My Company' }
    ];
    if (inviteToken) {
      attrs.push({ Name: 'custom:inviteToken', Value: inviteToken });
    }
    await this._call('SignUp', {
      ClientId: this.clientId,
      Username: email,
      Password: password,
      UserAttributes: attrs
    });
  },

  async confirm(email, code) {
    await this._call('ConfirmSignUp', {
      ClientId: this.clientId,
      Username: email,
      ConfirmationCode: code
    });
  },

  async login(email, password) {
    const data = await this._call('InitiateAuth', {
      ClientId: this.clientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    });

    this.tokens = {
      accessToken: data.AuthenticationResult.AccessToken,
      idToken: data.AuthenticationResult.IdToken,
      refreshToken: data.AuthenticationResult.RefreshToken
    };

    this.user = this._parseToken(this.tokens.idToken);
    this._save();
    return this.user;
  },

  async refresh() {
    if (!this.tokens || !this.tokens.refreshToken) throw new Error('No refresh token');

    const data = await this._call('InitiateAuth', {
      ClientId: this.clientId,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: {
        REFRESH_TOKEN: this.tokens.refreshToken
      }
    });

    this.tokens.accessToken = data.AuthenticationResult.AccessToken;
    this.tokens.idToken = data.AuthenticationResult.IdToken;
    this.user = this._parseToken(this.tokens.idToken);
    this._save();
  },

  logout() {
    this.tokens = null;
    this.user = null;
    localStorage.removeItem('fc_tokens');
  },

  isLoggedIn() {
    if (!this.tokens || !this.tokens.idToken) return false;
    try {
      var payload = this._parseToken(this.tokens.idToken);
      if (payload.exp * 1000 > Date.now()) return true;
      // Token expired but we have a refresh token — consider logged in, refresh in background
      if (this.tokens.refreshToken) {
        this.refresh().catch(function() {});
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  getAuthHeader() {
    if (!this.tokens || !this.tokens.idToken) return {};
    return { Authorization: 'Bearer ' + this.tokens.idToken };
  },

  _parseToken(token) {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  },

  _save() {
    if (this.tokens) {
      localStorage.setItem('fc_tokens', JSON.stringify(this.tokens));
    }
  },

  restore() {
    try {
      const stored = localStorage.getItem('fc_tokens');
      if (stored) {
        this.tokens = JSON.parse(stored);
        this.user = this._parseToken(this.tokens.idToken);
        // Refresh in background if expired — don't logout on failure
        if (this.user.exp * 1000 < Date.now() && this.tokens.refreshToken) {
          this.refresh().catch(function() {
            // Silent fail — next API call will get 401 and prompt login
          });
        }
      }
    } catch (e) {
      // Corrupted tokens — clear them
      this.logout();
    }
  }
};
