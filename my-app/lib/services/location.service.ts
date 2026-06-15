interface CepDataResponse { cep?: string; logradouro?: string; localidade?: string; uf?: string; [key: string]: unknown }

export const LocationService = {
  async fetchCepData(cep: string): Promise<CepDataResponse> {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) throw new Error('CEP inválido');

    // External API bypasses ApiClient to avoid interceptors/headers
    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (!response.ok) throw new Error('Falha ao buscar CEP');

    return response.json();
  }
};
