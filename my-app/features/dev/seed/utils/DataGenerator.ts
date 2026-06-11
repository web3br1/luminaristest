
export class DataGenerator {
    // Deterministic seed for "randomness" (simple LCG)
    private seed: number;

    constructor(seed: number = 42) {
        this.seed = seed;
    }

    private next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }

    randomElement<T>(arr: T[]): T {
        return arr[Math.floor(this.next() * arr.length)];
    }

    randomInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    randomDecimal(min: number, max: number, decimals: number = 2): number {
        const p = Math.pow(10, decimals);
        return Math.floor((this.next() * (max - min) + min) * p) / p;
    }

    randomDate(daysBack: number, futureDays: number = 0): string {
        const now = new Date();
        const start = new Date();
        start.setDate(now.getDate() - daysBack);

        const end = new Date();
        end.setDate(now.getDate() + futureDays);

        const diff = end.getTime() - start.getTime();
        const randomTime = start.getTime() + this.next() * diff;

        return new Date(randomTime).toISOString();
    }

    generateNames(count: number): string[] {
        const firstNames = [
            'Ana', 'Maria', 'Carla', 'Patricia', 'Juliana', 'Fernanda', 'Beatriz', 'Sandra', 'Lúcia', 'Renata',
            'Bruno', 'Carlos', 'Diego', 'Eduardo', 'Fabio', 'Gabriel', 'Hugo', 'Igor', 'João', 'Lucas',
            'Adriana', 'Amanda', 'Bianca', 'Camila', 'Daniela', 'Elaine', 'Flavia', 'Gabriela', 'Helena', 'Isabela',
            'Jessica', 'Larissa', 'Mariana', 'Natalia', 'Olivia', 'Paula', 'Rafaela', 'Sabrina', 'Tatiana', 'Vanessa',
            'André', 'Bernardo', 'Caio', 'Daniel', 'Elias', 'Felipe', 'Gustavo', 'Henrique', 'Ivan', 'Jorge'
        ];
        const lastNames = [
            'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes',
            'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa',
            'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas',
            'Cardoso', 'Ramos', 'Gonçalves', 'Santana', 'Teixeira', 'Cavalcanti', 'Melo', 'Barros', 'Franco', 'Campos'
        ];

        const results: string[] = [];
        for (let i = 0; i < count; i++) {
            results.push(`${this.randomElement(firstNames)} ${this.randomElement(lastNames)}`);
        }
        return results;
    }

    emailFromName(name: string): string {
        const domains = ['gmail.com', 'hotmail.com', 'outlook.com', 'uol.com.br', 'bol.com.br', 'yahoo.com.br'];
        // Remove accents
        let n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        // Remove special chars (everything that is not a letter or number or space)
        n = n.replace(/[^a-z0-9\s]/g, '');
        // Replace spaces with dots
        n = n.replace(/\s+/g, '.');
        return `${n}@${this.randomElement(domains)}`;
    }

    // New Data Lists
    get productBrands() {
        return ['L\'Oréal Professionnel', 'Kérastase', 'Redken', 'Wella Professionals', 'Schwarzkopf', 'Truss', 'Sebastian', 'Joico', 'Keune', 'Braé'];
    }

    get productCategories() {
        return ['Shampoo', 'Condicionador', 'Máscara', 'Finalizador', 'Coloração', 'Tratamento', 'Styling'];
    }

    generateProducts(count: number): any[] {
        const adj = ['Hidratante', 'Reparador', 'Nutritivo', 'Reconstrução', 'Matizador', 'Detox', 'Volume', 'Cachos', 'Liso', 'Brilho', 'Antiqueda', 'Anticaspa'];
        const types = ['Expert', 'Intense', 'Premium', 'Gold', 'Silver', 'Therapy', 'Care', 'Control', 'Defense', 'Force'];

        const products = [];
        for (let i = 0; i < count; i++) {
            const brand = this.randomElement(this.productBrands);
            const category = this.randomElement(this.productCategories);
            const name = `${brand} ${this.randomElement(types)} ${category} ${this.randomElement(adj)}`;
            const price = this.randomDecimal(40, 250);

            products.push({
                name,
                brand,
                category,
                sku: `${brand.substring(0, 3).toUpperCase()}-${this.randomInt(100, 999)}-${Date.now().toString().slice(-4)}`,
                salePrice: price,
                costPrice: Number((price * 0.4).toFixed(2)), // 40% cost
                minStock: this.randomInt(5, 20)
            });
        }
        return products;
    }

    get serviceCategories() {
        return ['Cabelo', 'Unhas', 'Estética', 'Depilação', 'Barba', 'Sobrancelhas', 'Maquiagem', 'Massagem'];
    }

    generateServices(count: number): any[] {
        const services = [
            { name: 'Corte Feminino', category: 'Cabelo', basePrice: 120, duration: 60 },
            { name: 'Corte Masculino', category: 'Cabelo', basePrice: 70, duration: 30 },
            { name: 'Escova Modeladora', category: 'Cabelo', basePrice: 80, duration: 45 },
            { name: 'Coloração Global', category: 'Cabelo', basePrice: 200, duration: 120 },
            { name: 'Mechas / Luzes', category: 'Cabelo', basePrice: 350, duration: 240 },
            { name: 'Hidratação Profunda', category: 'Cabelo', basePrice: 150, duration: 60 },
            { name: 'Botox Capilar', category: 'Cabelo', basePrice: 250, duration: 120 },
            { name: 'Progressiva', category: 'Cabelo', basePrice: 300, duration: 180 },
            { name: 'Manicure', category: 'Unhas', basePrice: 40, duration: 45 },
            { name: 'Pedicure', category: 'Unhas', basePrice: 50, duration: 45 },
            { name: 'Esmaltação em Gel', category: 'Unhas', basePrice: 90, duration: 90 },
            { name: 'Alongamento de Unhas', category: 'Unhas', basePrice: 180, duration: 120 },
            { name: 'Design de Sobrancelhas', category: 'Sobrancelhas', basePrice: 45, duration: 30 },
            { name: 'Micropigmentação', category: 'Sobrancelhas', basePrice: 500, duration: 120 },
            { name: 'Limpeza de Pele', category: 'Estética', basePrice: 150, duration: 90 },
            { name: 'Massagem Relaxante', category: 'Massagem', basePrice: 120, duration: 60 },
            { name: 'Drenagem Linfática', category: 'Massagem', basePrice: 100, duration: 60 },
            { name: 'Barba Completa', category: 'Barba', basePrice: 50, duration: 30 },
            { name: 'Corte + Barba', category: 'Barba', basePrice: 100, duration: 60 },
            { name: 'Maquiagem Social', category: 'Maquiagem', basePrice: 180, duration: 60 }
        ];

        // Return unique list or random subset if count is small
        // For this massive seed, we'll return almost all of them with slight price variations
        return services.slice(0, count).map(s => ({
            ...s,
            price: this.randomDecimal(s.basePrice * 0.9, s.basePrice * 1.2),
            cost: Number((s.basePrice * 0.2).toFixed(2)) // 20% estimated cost
        }));
    }
}
